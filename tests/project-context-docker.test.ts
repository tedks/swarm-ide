// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverDockerContainers, type DockerCommand } from "../core/project-context/docker";
import { ProjectContainerSchema } from "../protocol/project-context";

let scratch: string, root: string;
const id = (value = 1) => value.toString(16).padStart(64, "0");
const row = (directory: string, changes: Record<string, unknown> = {}) => ({ id: id(), name: "app-api-1", image: "app-api",
  state: "running", status: "Up 2 hours (healthy)", ports: "0.0.0.0:3001->3000/tcp, [::]:3001->3000/tcp", directory, service: "api", ...changes });
const sample = (changes: Record<string, unknown> = {}) => ({ id: id(), cpu: "6.03%", memory: "45.12MiB / 125.1GiB", ...changes });
const lines = (values: unknown[]) => values.map((value) => JSON.stringify(value)).join("\n");
function docker(list: unknown[], samples: unknown[] = [sample()]) {
  return vi.fn<DockerCommand>(async (args) => {
    if (args[0] === "context") return "unix:///var/run/docker.sock\n";
    if (args[0] === "ps") return lines(list);
    if (args[0] === "stats") return lines(samples);
    throw new Error("Unexpected Docker operation");
  });
}
beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "swarm-docker-context-")); root = join(scratch, "project");
  await mkdir(root); vi.stubEnv("DOCKER_HOST", ""); vi.stubEnv("DOCKER_CONTEXT", "");
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(scratch, { recursive: true, force: true }); });

describe("read-only project Docker observation", () => {
  it("attributes exact and descendant canonical Compose paths, never prefixes or names", async () => {
    const subdirectory = join(root, "deploy"), other = join(scratch, "project-other");
    await mkdir(subdirectory); await mkdir(other);
    const execute = docker([row(root), row(subdirectory, { id: id(2), state: "exited", status: "Exited (0)" }),
      row(other, { id: id(3), name: "project-api-1" }), row("/home/loveofdoing/chaos-speech/suitter", { id: id(4) }),
      row("", { id: id(5), name: "project-deployer" })]);
    const result = await discoverDockerContainers(root, new AbortController().signal, execute);
    expect(result.scan.status).toBe("observed");
    expect(result.containers.map((entry) => entry.directory)).toEqual([root, subdirectory]);
    expect(result.containers[0]).toMatchObject({ health: "healthy", cpuPercent: 6.03,
      memoryBytes: Math.round(45.12 * 1024 ** 2), memoryLimitBytes: Math.round(125.1 * 1024 ** 3),
      endpoints: [{ address: "0.0.0.0", port: 3001, protocol: "tcp" }, { address: "::", port: 3001, protocol: "tcp" }] });
    expect(result.containers[1].cpuPercent).toBeUndefined();
    for (const container of result.containers) expect(ProjectContainerSchema.safeParse(container).success).toBe(true);
    expect(execute.mock.calls[2][0].slice(-2)).toEqual(["--", id()]);
    expect(execute.mock.calls[1][0]).toContain("label=com.docker.compose.project.working_dir");
    expect(execute.mock.calls[1][0].join(" ")).not.toMatch(/\.Env|\.Command|\.Labels|config_files/);
    expect(execute.mock.calls.every(([args]) => ["context", "ps", "stats"].includes(args[0]))).toBe(true);
  });

  it("resolves root aliases, accepts real descendant aliases, and rejects symlink escapes", async () => {
    const alias = join(scratch, "root-alias"), inward = join(scratch, "inward"), outside = join(scratch, "outside");
    await mkdir(outside); await symlink(root, alias); await symlink(root, inward); await symlink(outside, join(root, "escape"));
    const result = await discoverDockerContainers(alias, new AbortController().signal,
      docker([row(inward), row(join(root, "escape"), { id: id(2) })]));
    expect(result.scan.status).toBe("observed"); expect(result.containers).toHaveLength(1);
    expect(result.containers[0].directory).toBe(root);
  });

  it("keeps only actual valid bindings, expands bounded port ranges, and never guesses URLs", async () => {
    const execute = docker([row(root, { ports: "9000/tcp, 8080-8082/tcp, 127.0.0.1:8000-8002->9000-9002/tcp, [::1]:53->53/udp, 0.0.0.0:0->3/tcp, evil.test:123->123/tcp" })]);
    const result = await discoverDockerContainers(root, new AbortController().signal, execute);
    expect(result.scan.status).toBe("partial");
    expect(result.containers[0].endpoints).toEqual([
      { address: "127.0.0.1", port: 8000, protocol: "tcp" }, { address: "127.0.0.1", port: 8001, protocol: "tcp" },
      { address: "127.0.0.1", port: 8002, protocol: "tcp" }, { address: "::1", port: 53, protocol: "udp" },
    ]);
    expect(result.containers[0].endpoints.every((endpoint) => endpoint.url === undefined)).toBe(true);
    const bounded = await discoverDockerContainers(root, new AbortController().signal, docker([row(root, { ports: "0.0.0.0:1000-1100->2000-2100/tcp" })]));
    expect(bounded.scan.status).toBe("partial"); expect(bounded.containers[0].endpoints).toHaveLength(16);
  });

  it("preserves health starting and unavailable metrics without inventing zeroes", async () => {
    const result = await discoverDockerContainers(root, new AbortController().signal,
      docker([row(root, { status: "Up 1 second (health: starting)" })], [sample({ cpu: "--", memory: "NaNMiB / infinity" })]));
    expect(result.scan.status).toBe("partial");
    expect(result.containers[0]).toMatchObject({ state: "running", health: "starting" });
    expect(result.containers[0].cpuPercent).toBeUndefined(); expect(result.containers[0].memoryBytes).toBeUndefined();
    const zero = await discoverDockerContainers(root, new AbortController().signal,
      docker([row(root)], [sample({ cpu: "0.00%", memory: "0B / 1GB" })]));
    expect(zero.containers[0]).toMatchObject({ cpuPercent: 0, memoryBytes: 0, memoryLimitBytes: 1e9 });
  });

  it("marks malformed, duplicate, and oversized observations incomplete without exposing errors", async () => {
    const execute = docker([row(root), row(root), row(root, { id: "--malicious", name: "bad\nname" })]);
    const result = await discoverDockerContainers(root, new AbortController().signal, execute);
    expect(result.scan.status).toBe("partial"); expect(result.containers).toHaveLength(1);
    const broken = vi.fn<DockerCommand>(async (args) => args[0] === "context" ? "unix:///var/run/docker.sock" : "{invalid-json");
    expect((await discoverDockerContainers(root, new AbortController().signal, broken)).scan.status).toBe("partial");
    const huge = vi.fn<DockerCommand>(async (args) => args[0] === "context" ? "unix:///var/run/docker.sock" : "x".repeat(256 * 1024 + 1));
    expect(await discoverDockerContainers(root, new AbortController().signal, huge)).toMatchObject({ scan: { status: "unavailable" }, containers: [] });
  });

  it("caps attributed containers and requests stats only for the bounded running IDs", async () => {
    const execute = docker(Array.from({ length: 40 }, (_, index) => row(root, { id: id(index + 1) })),
      Array.from({ length: 32 }, (_, index) => sample({ id: id(index + 1) })));
    const result = await discoverDockerContainers(root, new AbortController().signal, execute);
    expect(result.scan.status).toBe("partial"); expect(result.containers).toHaveLength(32);
    expect(execute.mock.calls[2][0].slice(6)).toHaveLength(32);
  });

  it("reports unavailable tooling/access compactly and keeps identity when only stats fail", async () => {
    vi.stubEnv("PATH", "");
    expect(await discoverDockerContainers(root, new AbortController().signal)).toMatchObject({ scan: { status: "unavailable" }, containers: [] });
    const denied = vi.fn<DockerCommand>(async () => { throw new Error("private credentials from stderr"); });
    const failed = await discoverDockerContainers(root, new AbortController().signal, denied);
    expect(failed.scan.status).toBe("unavailable"); expect(JSON.stringify(failed)).not.toContain("private");
    const execute = docker([row(root)]);
    execute.mockImplementation(async (args) => {
      if (args[0] === "context") return "unix:///var/run/docker.sock";
      if (args[0] === "ps") return lines([row(root)]);
      throw new Error("Stats timeout");
    });
    const result = await discoverDockerContainers(root, new AbortController().signal, execute);
    expect(result.scan.status).toBe("partial"); expect(result.containers[0].state).toBe("running");
    expect(result.containers[0].cpuPercent).toBeUndefined();
  });

  it("never assigns remote daemon paths to local worktrees", async () => {
    vi.stubEnv("DOCKER_HOST", "tcp://remote:2376");
    const execute = docker([row(root)]);
    const result = await discoverDockerContainers(root, new AbortController().signal, execute);
    expect(result.scan.status).toBe("unavailable"); expect(execute).not.toHaveBeenCalled();
    vi.stubEnv("DOCKER_CONTEXT", "local");
    expect((await discoverDockerContainers(root, new AbortController().signal, execute)).scan.status).toBe("observed");
  });

  it("honors cancellation before launch and while stats are in flight", async () => {
    const cancelled = new AbortController(); cancelled.abort(); const execute = docker([row(root)]);
    expect(await discoverDockerContainers(root, cancelled.signal, execute)).toMatchObject({ scan: { status: "unavailable", message: "Container scan cancelled" }, containers: [] });
    expect(execute).not.toHaveBeenCalled();
    const controller = new AbortController();
    execute.mockImplementation(async (args) => {
      if (args[0] === "context") return "unix:///var/run/docker.sock";
      if (args[0] === "ps") return lines([row(root)]);
      controller.abort(); return lines([sample()]);
    });
    expect(await discoverDockerContainers(root, controller.signal, execute)).toMatchObject({ scan: { status: "unavailable", message: "Container scan cancelled" }, containers: [] });
  });

  it("does not interpret no verified ownership as stopped services", async () => {
    const result = await discoverDockerContainers(root, new AbortController().signal, docker([row(join(root, "missing"))]));
    expect(result).toEqual({ scan: { status: "observed", message: "No containers with verified Compose worktree ownership" }, containers: [] });
  });
});
