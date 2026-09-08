// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverServices } from "../core/service-discovery";
import { RealWorkspaceProvider } from "../core/provider";
import { WorkspaceSnapshotSchema } from "../protocol/schema";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function repo(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "swarm-declared-services-")); roots.push(root);
  for (const [path, text] of Object.entries(files)) { await mkdir(join(root, path, ".."), { recursive: true }); await writeFile(join(root, path), text); }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "test"], { cwd: root });
  return root;
}
describe("project service declarations", () => {
  it("discovers two unrelated repositories without building or starting a container", async () => {
    const first = await repo({ "compose.yaml": "services:\n  frontend:\n    image: example/web\n    depends_on: [backend]\n  backend:\n    image: example/api\n" });
    const second = await repo({ "infra/docker-compose.yml": "services:\n  worker:\n    image: example/worker\n" });
    const a = await discoverServices(first), b = await discoverServices(second);
    expect(a.services.map((entry) => entry.displayName)).toEqual(["frontend", "backend"]);
    expect(a.dependencies).toEqual([{ source: "service:compose.yaml:frontend", target: "service:compose.yaml:backend", kind: "starts-after", label: "starts after" }]);
    expect(b.services.map((entry) => entry.displayName)).toEqual(["worker"]);
    expect(b.dependencies).toEqual([]);
    expect(a.services.every((entry) => !entry.owningTarget)).toBe(true);
  });
  it("retains explicit native interfaces and implementation/target links only", async () => {
    const declaration = { schemaVersion: 1, service: { id: "service:search", displayName: "Search" },
      providedInterfaces: [{ id: "interface:search.find", name: "Find", requestType: "search.Query", responseType: "search.Results" }],
      implementationPaths: ["src/search.ts"], owningTarget: "//src:search" };
    const root = await repo({ "services/search/service.swarm.json": JSON.stringify(declaration), "src/search.ts": "export const find = 1;" });
    const result = await discoverServices(root);
    expect(result.issues).toEqual([]);
    expect(result.services[0]).toMatchObject({ declarationPath: "services/search/service.swarm.json", implementationPaths: ["src/search.ts"], owningTarget: "//src:search",
      interfaces: [{ path: "services/search/service.swarm.json", role: "provided", name: "Find" }] });
  });
  it("does not infer services from package names, ports, examples or ignored dependency trees", async () => {
    const root = await repo({ "package.json": '{"name":"api"}', ".gitignore": "ignored/\n", "ignored/compose.yaml": "services: {secret: {image: x}}", "node_modules/a/compose.yaml": "services: {dependency: {image: x}}", "tests/compose.yaml": "services: {fixture: {image: x}}" });
    expect(await discoverServices(root)).toEqual({ services: [], dependencies: [], paths: [], issues: [] });
  });
  it("reports invalid, escaped, aliased and duplicate declarations without exposing their contents", async () => {
    const root = await repo({ "compose.yaml": "services: [password=never-display]", "a/service.swarm.json": JSON.stringify({ schemaVersion: 1, service: { id: "service:a", displayName: "A" }, implementationPaths: ["../outside.ts"] }) });
    await symlink("/etc/passwd", join(root, "docker-compose.yml"));
    const result = await discoverServices(root);
    expect(result.services).toEqual([]); expect(result.issues).toHaveLength(3);
    expect(JSON.stringify(result)).not.toMatch(/password=|root:x:/);
    const provider = await RealWorkspaceProvider.create(root);
    try {
      await provider.startReconciliation(() => {});
      expect(provider.snapshot().reconciliation.status).toBe("red");
      expect(provider.snapshot().graphs.find((graph) => graph.topologyId === "service")?.nodes).toEqual([]);
    } finally { provider.dispose(); }
  });
  it("handles anchors, undefined startup dependencies and unsupported includes explicitly", async () => {
    const root = await repo({ "compose.yaml": "x-common: &base\n  image: example/image\ninclude: [other.yaml]\nservices:\n  app:\n    <<: *base\n    depends_on: {missing: {condition: service_healthy}}\n" });
    const result = await discoverServices(root);
    expect(result.services.map((entry) => entry.displayName)).toEqual(["app"]); expect(result.dependencies).toEqual([]);
    expect(result.issues.join(" ")).toMatch(/not merged/); expect(result.issues.join(" ")).toMatch(/unresolved/);
  });
  it("automatically observes a saved edit, preserves prior graph on malformed input, and never advances built/deployed", async () => {
    const root = await repo({ "compose.yaml": "services: {alpha: {image: alpha}}" });
    const provider = await RealWorkspaceProvider.create(root);
    try {
      await provider.observeWorkingWorld(() => {});
      await provider.startReconciliation(() => {});
      expect(provider.snapshot().reconciliation.message).toBe("1 declared services");
      expect(provider.snapshot().serviceDeclarations?.services[0]?.displayName).toBe("alpha");
      expect(provider.snapshot().revisions.built.id).toBe("");
      await writeFile(join(root, "compose.yaml"), "services: {beta: {image: beta}}\n");
      await provider.observeWorkingWorld(() => {});
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      expect(provider.snapshot().serviceDeclarations?.services[0]?.displayName).toBe("beta");
      await writeFile(join(root, "compose.yaml"), "services: [broken");
      await provider.observeWorkingWorld(() => {});
      await provider.startReconciliation(() => {});
      expect(provider.snapshot().reconciliation.status).toBe("red");
      expect(provider.snapshot().serviceDeclarations?.services[0]?.displayName).toBe("beta");
      expect(provider.snapshot().revisions.deployed.id).toBe("");
      expect(WorkspaceSnapshotSchema.safeParse(provider.snapshot()).success).toBe(true);
    } finally { provider.dispose(); }
  });
  it("clears removed declarations instead of showing a fake fallback", async () => {
    const root = await repo({ "compose.yaml": "services: {alpha: {image: alpha}}" });
    execFileSync("git", ["add", "compose.yaml"], { cwd: root });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "tracked declaration"], { cwd: root });
    const provider = await RealWorkspaceProvider.create(root);
    try {
      await provider.startReconciliation(() => {});
      await rm(join(root, "compose.yaml"));
      await provider.startReconciliation(() => {});
      expect(provider.snapshot().serviceDeclarations?.services).toEqual([]);
      expect(provider.snapshot().reconciliation.message).toBe("No service declarations found");
    } finally { provider.dispose(); }
  });
  it("updates supported services despite unchanged partial-coverage warnings", async () => {
    const root = await repo({ "compose.yaml": "include: [elsewhere.yaml]\nservices: {alpha: {image: alpha}}" });
    const provider = await RealWorkspaceProvider.create(root);
    try {
      await provider.startReconciliation(() => {});
      expect(provider.snapshot().serviceDeclarations?.status).toBe("partial");
      await writeFile(join(root, "compose.yaml"), "include: [elsewhere.yaml]\nservices: {beta: {image: beta}}");
      await provider.startReconciliation(() => {});
      expect(provider.snapshot().serviceDeclarations?.services[0]?.displayName).toBe("beta");
    } finally { provider.dispose(); }
  });
  it("isolates service identifiers that collide with another declaration's interface node", async () => {
    const root = await repo({ "a/service.swarm.json": JSON.stringify({ schemaVersion: 1, service: { id: "service:a", displayName: "A" },
      providedInterfaces: [{ id: "x", name: "X", requestType: "a.Request", responseType: "a.Reply" }] }),
      "b/service.swarm.json": JSON.stringify({ schemaVersion: 1, service: { id: "service:a:provided:x", displayName: "Collision" } }) });
    const result = await discoverServices(root);
    expect(result.services.map((service) => service.displayName)).toEqual(["A"]);
    expect(result.invalid).toBe(true); expect(result.issues.join(" ")).toContain("duplicate service/interface id");
  });
});
