import { describe, expect, it } from "vitest";
import { ProjectContextProvider } from "../core/project-context/provider";
import { ProjectContextObservationSchema, ProjectEndpointSchema } from "../protocol/project-context";
import { PROTOCOL_VERSION, parseCoreResponseForRequest } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";

const node = async () => ({ scan: { status: "observed" as const }, servers: [] });
const docker = async () => ({ scan: { status: "unavailable" as const, message: "Docker unavailable" }, containers: [] });

describe("automatic project observation", () => {
  it("joins independent providers, coalesces requests and caches briefly", async () => {
    let reads = 0;
    const provider = new ProjectContextProvider("/project", "repo", "world", async () => { reads++; return node(); }, docker);
    const a = provider.observe(), b = provider.observe();
    expect(a).toBe(b);
    const result = await a;
    expect(result).toMatchObject({ repositoryId: "repo", worldId: "world", servers: [], docker: { status: "unavailable" } });
    expect(await provider.observe()).toBe(result);
    expect(reads).toBe(1);
    await provider.dispose();
    await expect(provider.observe()).rejects.toThrow("closed");
  });
  it("cancels pending discovery and does not publish on disposal", async () => {
    let aborted = false;
    const provider = new ProjectContextProvider("/project", "repo", "world", async (_root, signal) => {
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
      return node();
    }, docker);
    const pending = provider.observe();
    const failure = expect(pending).rejects.toThrow("closed");
    await provider.dispose(); await failure;
    expect(aborted).toBe(true);
  });
  it("contains an unavailable provider without inventing observations", async () => {
    const provider = new ProjectContextProvider("/project", "repo", "world", async () => { throw new Error("permission"); }, docker);
    expect(await provider.observe()).toMatchObject({ servers: [], node: { status: "unavailable" }, containers: [] });
    await provider.dispose();
  });
  it("validates identity, finite values, normal text and safe links", () => {
    const result = { repositoryId: "repo", worldId: "world", observedAt: new Date().toISOString(), servers: [], containers: [], node: { status: "observed" }, docker: { status: "unavailable" } };
    expect(ProjectContextObservationSchema.safeParse(result).success).toBe(true);
    expect(ProjectEndpointSchema.safeParse({ address: "0.0.0.0", port: 5173, protocol: "tcp", url: "http://framework0:5173" }).success).toBe(true);
    for (const url of ["file:///tmp/file", "http://user:password@localhost:3000", "http://0.0.0.0:3000", "http://[::]:3000"]) {
      expect(ProjectEndpointSchema.safeParse({ address: "127.0.0.1", port: 3000, protocol: "tcp", url }).success).toBe(false);
    }
    const snapshot = initialSnapshot();
    const request = { type: "projectContext.observe" as const, requestId: "test", protocolVersion: PROTOCOL_VERSION, repositoryId: snapshot.project.id, worldId: snapshot.world.id };
    const reply = { ok: true, requestId: "test", protocolVersion: PROTOCOL_VERSION, snapshot, sequence: 1,
      projectContext: { ...result, repositoryId: snapshot.project.id, worldId: snapshot.world.id } };
    expect(parseCoreResponseForRequest(reply, request).ok).toBe(true);
    expect(() => parseCoreResponseForRequest({ ...reply, projectContext: { ...reply.projectContext, worldId: "other" } }, request)).toThrow();
    expect(() => parseCoreResponseForRequest(reply, { type: "workspace.snapshot", requestId: "test", protocolVersion: PROTOCOL_VERSION })).toThrow();
  });
});
