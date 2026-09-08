// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProductionAgentService, type ProductionAgentService } from "../core/agents/production";
import { readWorkspaceFile } from "../core/files";
import { computeWorkingWorldFingerprint } from "../core/fingerprint";
import { RealWorkspaceProvider, type ProviderDependencies } from "../core/provider";
import { discoverServices, type ServiceDiscovery } from "../core/service-discovery";
import { PROTOCOL_VERSION, type WorkspaceSnapshot } from "../protocol/schema";
import { repositoryEntryId, type RepositoryObservation, type RepositoryRequest } from "../protocol/repository";
import { WorkingWorldObserver } from "../core/working-world-observer";
import { registerRepository } from "../core/repository-registration";

const roots: string[] = [], providers: RealWorkspaceProvider[] = [], services: ProductionAgentService[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.shutdown()));
  providers.splice(0).forEach((provider) => provider.dispose());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const now = "2026-09-06T12:00:00.000Z";
const repositoryId = `repository:${"0".repeat(64)}`;
const fingerprint = "a".repeat(64);
const ignorePublish = () => undefined;
const listRequest = (directory = "", patch: Partial<RepositoryRequest> = {}): RepositoryRequest => ({
  protocolVersion: PROTOCOL_VERSION, requestId: `list:${directory || "root"}`, type: "repo.list",
  directory, page: 0, filter: "", refresh: true, ...patch,
});
function observation(directory: string, names: string[], id = `capture:${directory || "root"}`): RepositoryObservation {
  return { directory, observationId: id, capturedAt: now, state: "observed", complete: true,
    capturedCount: names.length, filteredCount: names.length, page: 0, pageCount: 1, filter: "",
    entries: names.map((label) => {
      const path = directory ? `${directory}/${label}` : label;
      return { id: repositoryEntryId(repositoryId, "file", path), path, label, kind: "file", git: "tracked", actionable: true };
    }) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const declaration: ServiceDiscovery = {
  services: [{ id: "service:alpha", displayName: "Alpha", declarationPath: "services/alpha/service.swarm.json",
    implementationPaths: ["services/alpha/main.ts"],
    interfaces: [{ id: "interface:alpha.read", name: "Read", role: "provided", path: "services/alpha/api.proto", requestType: "fixture.Request", responseType: "fixture.Decision" }] }],
  dependencies: [], paths: ["services/alpha/service.swarm.json"], issues: [],
};
function fixtureDependencies(overrides: Partial<ProviderDependencies> = {}): ProviderDependencies {
  return {
    register: async (root) => ({ root, id: repositoryId, name: "Provider composition fixture" }),
    fingerprint: async () => fingerprint,
    discover: async () => declaration,
    now: () => now,
    repository: () => ({ list: async (request) => observation(request.directory, ["file.ts"]), markStale() {}, dispose() {} }),
    ...overrides,
  };
}
async function provider(dependencies: ProviderDependencies, root = "/fixture") {
  const result = await RealWorkspaceProvider.create(root, dependencies);
  providers.push(result);
  return result;
}
const repo = (provider: RealWorkspaceProvider) => provider.snapshot().graphs.find((graph) => graph.topologyId === "repo")!;
async function actualRepository() {
  const directory = await mkdtemp(join(tmpdir(), "swarm-repository-provider-")); roots.push(directory);
  const root = join(directory, "unfamiliar-repository");
  await mkdir(join(root, "core"), { recursive: true });
  await writeFile(join(root, "README.md"), "An unfamiliar repository, not a demo.\n");
  await writeFile(join(root, "core", "files.ts"), "export const source = 'actual disk';\n");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe", env: {
    ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null",
  } });
  git("init", "-q"); git("config", "user.name", "Repository fixture"); git("config", "user.email", "fixture@example.invalid");
  git("add", "."); git("commit", "-qm", "actual repository fixture");
  const discover = vi.fn(discoverServices);
  const dependencies: ProviderDependencies = { fingerprint: computeWorkingWorldFingerprint, discover, now: () => now };
  return { directory, root, discover, dependencies };
}

describe("repository navigation independent of working and service evidence", () => {
  it("does not suppress a first genuine failure after external invalidation during startup", async () => {
    const subject = await provider(fixtureDependencies());
    let reject!: (error: Error) => void;
    const pending = new Promise<string>((_resolve, fail) => { reject = fail; });
    const failures: string[] = [];
    let observer!: WorkingWorldObserver;
    const publish = ignorePublish;
    observer = new WorkingWorldObserver("", () => pending,
      (value) => subject.markWorkingWorldChanged(value, publish), (error) => {
        failures.push(error.message); subject.markWorkingWorldUnknown(error.message, publish);
      });
    try {
      observer.request();
      await subject.listRepository(listRequest(), publish);
      observer.invalidate();
      reject(new Error("Initial filename evidence unavailable"));
      await vi.waitFor(() => expect(failures).toEqual(["Initial filename evidence unavailable"]));
      expect(subject.snapshot().reconciliation.status).toBe("red");
      expect(repo(subject).directory?.state).toBe("stale");
      expect(subject.snapshot().revisions.working).toMatchObject({ fingerprint: "", evidence: "unavailable" });
    } finally { observer.close(); }
  });
  it("registers a canonical committed root whose actual name ends in whitespace", async () => {
    const fixture = await actualRepository();
    const root = `${fixture.root} `;
    await rename(fixture.root, root);
    expect(await registerRepository(root)).toMatchObject({ root, name: "unfamiliar-repository " });
  });
  it("recovers unchanged observer evidence after a reconciliation-only fingerprint failure", async () => {
    let failPreflight = false;
    const subject = await provider(fixtureDependencies({ fingerprint: async () => {
      if (failPreflight) throw new Error("Source preflight temporarily unavailable");
      return fingerprint;
    } }));
    await subject.observeWorkingWorld(ignorePublish);
    const published: WorkspaceSnapshot[] = [];
    const beforeRevocation = deferred<string>(), afterRevocation = deferred<string>();
    let samples = 0;
    let observer!: WorkingWorldObserver;
    const publish = (_type: string, snapshot: WorkspaceSnapshot) => { published.push(snapshot); };
    const externalPublish = (type: string, snapshot: WorkspaceSnapshot) => {
      if (snapshot.revisions.working.evidence === "unavailable") observer.invalidate();
      publish(type, snapshot);
    };
    observer = new WorkingWorldObserver(fingerprint, () => ++samples === 1 ? beforeRevocation.promise : afterRevocation.promise,
      (value) => subject.markWorkingWorldChanged(value, publish), (error) => subject.markWorkingWorldUnknown(error.message, publish));
    try {
      observer.request();
      failPreflight = true;
      await subject.startReconciliation(externalPublish);
      expect(subject.snapshot().revisions.working).toMatchObject({ fingerprint, evidence: "unavailable" });
      beforeRevocation.resolve(fingerprint);
      await vi.waitFor(() => expect(samples).toBe(2));
      expect(subject.snapshot().revisions.working.evidence).toBe("unavailable");
      afterRevocation.resolve(fingerprint);
      await vi.waitFor(() => expect(subject.snapshot().revisions.working.evidence).toBe("observed"));
      expect(subject.snapshot().reconciliation.status).toBe("yellow");
      expect(published.map((snapshot) => snapshot.reconciliation.status)).toEqual(["red", "yellow"]);
    } finally { observer.close(); }
  });
  it("registers and lists actual supported paths without awaiting a pending whole-world fingerprint", async () => {
    const fixture = await actualRepository();
    const pending = deferred<string>();
    const fingerprintProbe = vi.fn(() => pending.promise);
    const subject = await provider({ ...fixture.dependencies, fingerprint: fingerprintProbe }, fixture.root);
    expect(fingerprintProbe).not.toHaveBeenCalled();
    const observing = subject.observeWorkingWorld(ignorePublish);
    try {
      expect(subject.snapshot().project).toEqual({ name: "unfamiliar-repository",
        id: `repository:${createHash("sha256").update(fixture.root).digest("hex")}` });
      expect(subject.snapshot().revisions.working).toMatchObject({ id: expect.stringMatching(/^unobserved:/), fingerprint: "", evidence: "unavailable" });
      expect(subject.snapshot().reconciliation.lastConsistentFingerprint).toBe("unobserved");
      const rootListing = await subject.listRepository(listRequest(), ignorePublish);
      expect(rootListing.entries.map((entry) => entry.path)).toEqual(["core", "README.md"]);
      await subject.listRepository(listRequest("core"), ignorePublish);
      expect(repo(subject).nodes.map((node) => node.focus.path)).toEqual(["core", "core/files.ts"]);
      expect(await readWorkspaceFile(fixture.root, "core/files.ts")).toMatchObject({ content: "export const source = 'actual disk';\n" });
      expect(fixture.discover).not.toHaveBeenCalled();
      expect(subject.snapshot().revisions.working.evidence).toBe("unavailable");
    } finally { pending.resolve(fingerprint); await observing; }
    expect(subject.snapshot().revisions.working.evidence).toBe("observed");
    expect(repo(subject).directory?.directory).toBe("core");
    expect(repo(subject).nodes.every((node) => node.focus.revisionId === fingerprint && node.status === "gray")).toBe(true);
  });

  it.each(["invalid UTF-8 filename", "fingerprint byte budget"] as const)("retains real browsing and source reads after initial %s failure, without green or context authority", async (failure) => {
    const fixture = await actualRepository();
    if (failure === "invalid UTF-8 filename") {
      await writeFile(Buffer.concat([Buffer.from(`${fixture.root}/invalid-`), Buffer.from([0xff])]), "unsupported filename\n");
    } else {
      const oversized = join(fixture.root, "oversized.bin");
      await writeFile(oversized, "");
      await truncate(oversized, 64 * 1024 * 1024 + 1);
    }
    const subject = await provider(fixture.dependencies, fixture.root);
    await subject.observeWorkingWorld(ignorePublish);
    expect(subject.snapshot().reconciliation.status).toBe("red");
    expect(subject.snapshot().reconciliation.message).toContain(failure === "invalid UTF-8 filename" ? "not valid UTF-8" : "fingerprint bound");
    expect(subject.snapshot().revisions.working).toMatchObject({ fingerprint: "", evidence: "unavailable" });
    const listing = await subject.listRepository(listRequest(), ignorePublish);
    expect(listing.entries.some((entry) => entry.path === "core" && entry.actionable)).toBe(true);
    expect(listing.entries.some((entry) => entry.path === "README.md" && entry.actionable)).toBe(true);
    if (failure === "invalid UTF-8 filename") expect(listing.entries).toContainEqual(expect.objectContaining({ kind: "unsupported", path: null, actionable: false }));
    await subject.listRepository(listRequest("core"), ignorePublish);
    expect(await readWorkspaceFile(fixture.root, "core/files.ts")).toMatchObject({ content: "export const source = 'actual disk';\n" });
    await subject.startReconciliation(ignorePublish);
    expect(fixture.discover).not.toHaveBeenCalled();
    expect(subject.snapshot().reconciliation).toMatchObject({ status: "red", lastConsistentFingerprint: "unobserved" });
    expect(repo(subject).directory?.directory).toBe("core");
    expect(repo(subject).reconciliation).toBe("gray");
    const service = await createProductionAgentService({ root: fixture.root, storeRoot: join(fixture.directory, "private"), snapshot: () => subject.snapshot(), emit() {} });
    services.push(service);
    const focus = repo(subject).nodes.find((node) => node.focus.path === "core/files.ts")!.focus;
    expect(await service.request({ protocolVersion: PROTOCOL_VERSION, requestId: "prepare-unavailable", type: "agent.prepare",
      worldId: focus.worldId, focus, taskText: "Explain this file", model: null, effort: null,
      links: { parentRunId: null, task: null, spec: null } })).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
  });

  it("commits a completed directory into the latest successful service publication", async () => {
    const pending = deferred<RepositoryObservation>();
    const subject = await provider(fixtureDependencies({ repository: () => ({
      list: async (request) => request.directory === "core" ? pending.promise : observation("", ["README.md"]), markStale() {}, dispose() {},
    }) }));
    await subject.listRepository(listRequest(), ignorePublish);
    const listing = subject.listRepository(listRequest("core"), ignorePublish);
    await subject.startReconciliation(ignorePublish);
    const beforeNavigation = structuredClone(subject.snapshot());
    expect(beforeNavigation.reconciliation.status).toBe("green");
    pending.resolve(observation("core", ["files.ts"]));
    await listing;
    expect(subject.snapshot().graphs.find((graph) => graph.topologyId === "service")).toEqual(beforeNavigation.graphs.find((graph) => graph.topologyId === "service"));
    expect(subject.snapshot().revisions).toEqual(beforeNavigation.revisions);
    expect(subject.snapshot().reconciliation).toEqual(beforeNavigation.reconciliation);
    expect(subject.snapshot().jobs).toEqual(beforeNavigation.jobs);
    expect(subject.snapshot().activity).toEqual(beforeNavigation.activity);
    expect(repo(subject)).toMatchObject({ reconciliation: "gray", directory: { directory: "core" } });
    expect(repo(subject).nodes.every((node) => node.status === "gray")).toBe(true);
    const candidates = subject.snapshot().mappings.filter((mapping) => mapping.targetTopology === "repo").flatMap((mapping) => mapping.candidates);
    expect(candidates).toHaveLength(3);
    expect(candidates.every((candidate) => candidate.revealPath !== undefined && candidate.nodeId === undefined)).toBe(true);
  });

  it("does not allow late directory A to replace newer B, including after service publication", async () => {
    const pendingA = deferred<RepositoryObservation>();
    const subject = await provider(fixtureDependencies({ repository: () => ({
      list: async (request) => request.directory === "a" ? pendingA.promise : observation(request.directory, ["file.ts"]), markStale() {}, dispose() {},
    }) }));
    const published: WorkspaceSnapshot[] = [];
    const old = subject.listRepository(listRequest("a"), (_type, snapshot) => published.push(snapshot));
    const rejection = expect(old).rejects.toMatchObject({ code: "REPOSITORY_STALE" });
    await subject.listRepository(listRequest("b"), (_type, snapshot) => published.push(snapshot));
    await subject.startReconciliation(ignorePublish);
    const current = structuredClone(subject.snapshot());
    pendingA.resolve(observation("a", ["old.ts"]));
    await rejection;
    expect(subject.snapshot()).toEqual(current);
    expect(published).toHaveLength(1);
    expect(repo(subject).directory?.directory).toBe("b");
  });

  it("rebinds declaration and interface links to actual directory nodes and back to reveal paths", async () => {
    const subject = await provider(fixtureDependencies({ repository: () => ({
      list: async (request) => observation(request.directory, request.directory === "services/alpha" ? ["service.swarm.json", "main.ts", "api.proto"] : ["files.ts"]),
      markStale() {}, dispose() {},
    }) }));
    await subject.startReconciliation(ignorePublish);
    const service = structuredClone(subject.snapshot().graphs.find((graph) => graph.topologyId === "service"));
    const candidates = () => subject.snapshot().mappings.filter((mapping) => mapping.targetTopology === "repo").flatMap((mapping) => mapping.candidates);
    expect(candidates().every((candidate) => candidate.revealPath && !candidate.nodeId)).toBe(true);
    await subject.listRepository(listRequest("services/alpha"), ignorePublish);
    for (const candidate of candidates()) {
      expect(candidate.nodeId).toBe(repo(subject).nodes.find((node) => node.focus.path === candidate.focus.path)?.id);
      expect(candidate.nodeId).toBeDefined(); expect(candidate.revealPath).toBeUndefined();
    }
    await subject.listRepository(listRequest("core"), ignorePublish);
    expect(candidates().every((candidate) => candidate.revealPath === candidate.focus.path && !candidate.nodeId)).toBe(true);
    expect(subject.snapshot().graphs.find((graph) => graph.topologyId === "service")).toEqual(service);
  });

  it("retains the last successful slice on failure and preserves surviving positions across refresh and red/green transitions", async () => {
    let refreshed = false, discoveryFails = false;
    const subject = await provider(fixtureDependencies({ discover: async () => {
      if (discoveryFails) throw new Error("fixture declaration scan failed");
      return declaration;
    }, repository: () => ({ list: async (request) => {
      if (request.directory === "missing") throw new Error("missing directory fixture");
      return observation("core", refreshed ? ["a.ts", "b.ts", "c.ts"] : ["b.ts", "c.ts"], refreshed ? "capture:new" : "capture:old");
    }, markStale() {}, dispose() {} }) }));
    await subject.listRepository(listRequest("core"), ignorePublish);
    const prior = structuredClone(repo(subject));
    await expect(subject.listRepository(listRequest("missing"), ignorePublish)).rejects.toThrow("missing directory fixture");
    expect(repo(subject)).toEqual(prior);
    refreshed = true;
    await subject.listRepository(listRequest("core"), ignorePublish);
    for (const node of prior.nodes) expect(repo(subject).nodes.find((current) => current.id === node.id)?.position).toEqual(node.position);
    expect(new Set(repo(subject).nodes.map((node) => JSON.stringify(node.position))).size).toBe(repo(subject).nodes.length);
    const refreshedNodes = structuredClone(repo(subject).nodes);
    await subject.startReconciliation(ignorePublish);
    expect(subject.snapshot().reconciliation.status).toBe("green");
    subject.markWorkingWorldChanged("b".repeat(64), ignorePublish);
    expect(repo(subject).directory).toMatchObject({ state: "stale", observationId: "capture:new", directory: "core" });
    subject.markWorkingWorldUnknown("observer failure", ignorePublish);
    expect(repo(subject).reconciliation).toBe("gray");
    discoveryFails = true;
    await subject.startReconciliation(ignorePublish);
    expect(subject.snapshot().reconciliation.status).toBe("red");
    expect(repo(subject).nodes.map(({ id, position, status }) => ({ id, position, status })))
      .toEqual(refreshedNodes.map(({ id, position, status }) => ({ id, position, status })));
  });

  it("ends the initial loading notice on failure and rejects pending publications after disposal", async () => {
    const pending = deferred<RepositoryObservation>();
    const dispose = vi.fn();
    let fail = true;
    const subject = await provider(fixtureDependencies({ repository: () => ({ list: async () => {
      if (fail) throw new Error("initial unavailable");
      return pending.promise;
    }, markStale() {}, dispose }) }));
    const published: WorkspaceSnapshot[] = [];
    await expect(subject.listRepository(listRequest(), (_type, snapshot) => published.push(snapshot))).rejects.toThrow("initial unavailable");
    expect(repo(subject).directory).toMatchObject({ state: "error", directory: "", capturedCount: 0 });
    fail = false;
    const navigating = subject.listRepository(listRequest(), (_type, snapshot) => published.push(snapshot));
    const rejection = expect(navigating).rejects.toMatchObject({ code: "REPOSITORY_STALE" });
    const before = subject.snapshot();
    subject.dispose();
    pending.resolve(observation("", ["after-disposal.ts"]));
    await rejection;
    expect(dispose).toHaveBeenCalledOnce();
    expect(subject.snapshot()).toBe(before);
    expect(published).toHaveLength(1);
    await expect(subject.listRepository(listRequest(), ignorePublish)).rejects.toMatchObject({ code: "REPOSITORY_UNAVAILABLE" });
  });
});
