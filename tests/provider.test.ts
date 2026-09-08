// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSnapshot } from "../protocol/schema";
import { RealWorkspaceProvider, type ProviderDependencies } from "../core/provider";
import type { ServiceDiscovery } from "../core/service-discovery";

const a = "a".repeat(64), b = "b".repeat(64);
const declaration: ServiceDiscovery = {
  services: [{ id: "service:alpha", displayName: "Alpha", declarationPath: "services/alpha/service.swarm.json",
    implementationPaths: ["services/alpha/main.ts"], owningTarget: "//services/alpha:sources",
    interfaces: [{ id: "interface:alpha.read", name: "Read", role: "provided", path: "services/alpha/api.proto", requestType: "alpha.Request", responseType: "alpha.Response" }] }],
  dependencies: [], paths: ["services/alpha/service.swarm.json"], issues: [],
};
const providers: RealWorkspaceProvider[] = [];
afterEach(() => { providers.splice(0).forEach((provider) => provider.dispose()); vi.useRealTimers(); });
function dependencies(overrides: Partial<ProviderDependencies> = {}): ProviderDependencies {
  return { register: async (root) => ({ root, id: "repository:" + "0".repeat(64), name: "Provider fixture" }),
    fingerprint: async () => a, discover: async () => declaration,
    now: () => "2026-09-08T12:00:00.000Z", ...overrides };
}
async function provider(overrides: Partial<ProviderDependencies> = {}) {
  const result = await RealWorkspaceProvider.create("/unused", dependencies(overrides)); providers.push(result); return result;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve };
}
const graph = (subject: RealWorkspaceProvider) => subject.snapshot().graphs.find((value) => value.topologyId === "service")!;

describe("declaration-backed workspace provider", () => {
  it("registers with honest unavailable evidence without awaiting discovery or fingerprinting", async () => {
    const fingerprint = vi.fn(async () => a), discover = vi.fn(async () => declaration);
    const subject = await provider({ fingerprint, discover }), initial = subject.snapshot();
    expect(fingerprint).not.toHaveBeenCalled(); expect(discover).not.toHaveBeenCalled();
    expect(initial.reconciliation.status).toBe("gray"); expect(graph(subject).nodes).toEqual([]);
    expect(initial.jobs).toEqual([]); expect(initial.mappings).toEqual([]);
    expect(initial.revisions.working).toMatchObject({ fingerprint: "", evidence: "unavailable" });
    expect(initial.revisions.built).toEqual({ id: "", sourceFingerprint: "" });
    expect(initial.serviceContext).toBeUndefined(); expect(initial.serviceDeclarations).toBeUndefined();
    expect(JSON.stringify(initial)).not.toMatch(/sourceKind":"(?:mock|runtime|build)/);
  });

  it("publishes yellow then exact source declarations without claiming a build or deployment", async () => {
    const subject = await provider(), published: WorkspaceSnapshot[] = [];
    await subject.startReconciliation((_type, snapshot) => published.push(snapshot));
    expect(published.map((snapshot) => snapshot.reconciliation.status)).toEqual(["yellow", "green"]);
    const current = subject.snapshot();
    expect(graph(subject).nodes.map((node) => node.label)).toEqual(["Alpha", "Read"]);
    expect(graph(subject).edges.map((edge) => edge.kind)).toEqual(["provides"]);
    expect(graph(subject).provenance.every((item) => item.sourceKind === "repo" && item.version === a)).toBe(true);
    expect(current.serviceDeclarations).toMatchObject({ status: "current", sourceFingerprint: a, services: declaration.services });
    expect(current.serviceContext).toBeUndefined(); expect(current.jobs).toEqual([]);
    expect(current.revisions.built).toEqual({ id: "", sourceFingerprint: "" });
    expect(current.revisions.deployed).toEqual({ id: "", buildId: "", environment: "not configured" });
    expect(current.mappings.flatMap((mapping) => mapping.candidates).filter((candidate) => candidate.focus.domain === "repo")
      .map((candidate) => candidate.revealPath)).toEqual(["services/alpha/service.swarm.json", "services/alpha/main.ts", "services/alpha/api.proto"]);
  });

  it.each(["core/files.ts", "services/beta/api.proto"])("does not leak declared ownership onto unrelated file %s", async (path) => {
    const subject = await provider(); await subject.startReconciliation(() => {});
    const snapshot = subject.selectFocus({ ...subject.snapshot().focus, domain: "repo", key: "file:" + path, path });
    expect(snapshot.widgets.map((widget) => widget.id)).toEqual(["selected-source"]);
    expect(snapshot.widgets[0]?.value).toBe(path);
  });

  it("automatically discovers after a working-world observation and coalesces source changes", async () => {
    vi.useFakeTimers();
    const discover = vi.fn(async () => declaration), subject = await provider({ discover, fingerprint: async () => b });
    await subject.observeWorkingWorld(() => {});
    subject.markWorkingWorldChanged(a, () => {}); subject.markWorkingWorldChanged(b, () => {});
    expect(discover).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(discover).toHaveBeenCalledOnce(); expect(subject.snapshot().reconciliation.status).toBe("green");
    expect(subject.snapshot().serviceDeclarations?.sourceFingerprint).toBe(b);
  });

  it("publishes a useful empty current state when no declaration exists", async () => {
    const subject = await provider({ discover: async () => ({ services: [], dependencies: [], paths: [], issues: [] }) });
    await subject.startReconciliation(() => {});
    expect(graph(subject).nodes).toEqual([]); expect(graph(subject).edges).toEqual([]); expect(subject.snapshot().mappings).toEqual([]);
    expect(subject.snapshot().reconciliation).toMatchObject({ status: "green", message: "No service declarations found" });
    expect(subject.snapshot().serviceDeclarations).toMatchObject({ status: "current", services: [], issues: [] });
    expect(subject.snapshot().jobs).toEqual([]);
  });

  it.each([true, false])("reports a partial first observation with usable services present=%s", async (usable) => {
    const subject = await provider({ discover: async () => ({ ...declaration, services: usable ? declaration.services : [], issues: ["compose.yaml: invalid declaration"], invalid: true }) });
    await subject.startReconciliation(() => {});
    expect(subject.snapshot().reconciliation).toMatchObject({ status: "yellow", lastConsistentFingerprint: "unobserved" });
    expect(subject.snapshot().reconciliation.message).toContain("compose.yaml");
    expect(subject.snapshot().serviceDeclarations?.status).toBe("partial");
    expect(graph(subject).nodes.length).toBe(usable ? 2 : 0);
  });

  it("retains the last graph, source selection and positions throughout refresh and later failure", async () => {
    const pending = deferred<ServiceDiscovery>(); let refresh = false;
    const subject = await provider({ discover: () => refresh ? pending.promise : Promise.resolve(declaration) });
    await subject.startReconciliation(() => {});
    const path = "services/alpha/main.ts";
    subject.selectFocus({ ...subject.snapshot().focus, domain: "repo", key: "file:" + path, path });
    const previous = structuredClone(graph(subject)); refresh = true;
    const running = subject.startReconciliation(() => {});
    await vi.waitFor(() => expect(subject.snapshot().reconciliation.status).toBe("yellow"));
    expect(graph(subject).nodes).toEqual(previous.nodes); expect(subject.snapshot().focus.path).toBe(path);
    pending.resolve({ services: [], dependencies: [], paths: [], issues: ["compose.yaml: invalid declaration"], invalid: true }); await running;
    expect(subject.snapshot().reconciliation.status).toBe("red"); expect(graph(subject).nodes).toEqual(previous.nodes);
    expect(subject.snapshot().focus.path).toBe(path); expect(subject.snapshot().serviceDeclarations?.services).toEqual(declaration.services);
  });

  it("retains a usable partial graph when source changes before any completely supported observation", async () => {
    const subject = await provider({ discover: async () => ({ ...declaration, issues: ["nested/compose.yaml: unsupported include"] }) });
    await subject.startReconciliation(() => {});
    expect(subject.snapshot().reconciliation.lastConsistentFingerprint).toBe("unobserved");
    const previous = graph(subject).nodes.map(({ id, position }) => ({ id, position }));
    subject.markWorkingWorldChanged(b, () => {});
    expect(graph(subject).nodes.map(({ id, position }) => ({ id, position }))).toEqual(previous);
    expect(subject.snapshot().serviceDeclarations?.sourceFingerprint).toBe(a);
    expect(graph(subject).reconciliation).toBe("yellow");
  });

  it("publishes usable authored updates with unsupported fields instead of treating partial coverage as invalid data", async () => {
    let partial = false;
    const subject = await provider({ discover: async () => partial ? { ...declaration,
      services: [...declaration.services, { id: "service:beta", displayName: "Beta", declarationPath: "compose.yaml", implementationPaths: [], interfaces: [] }],
      paths: [...declaration.paths, "compose.yaml"], issues: ["compose.yaml: inherited fields are not shown"] } : declaration });
    await subject.startReconciliation(() => {}); partial = true;
    await subject.startReconciliation(() => {});
    expect(subject.snapshot().reconciliation.status).toBe("yellow");
    expect(subject.snapshot().serviceDeclarations?.status).toBe("partial");
    expect(graph(subject).nodes.map((node) => node.label)).toEqual(["Alpha", "Read", "Beta"]);
  });

  it("reports a first discovery failure without fabricating topology or build jobs", async () => {
    const subject = await provider({ discover: async () => { throw new Error("Service declaration scan failed"); } });
    const published: WorkspaceSnapshot[] = [];
    await subject.startReconciliation((_type, snapshot) => published.push(snapshot));
    expect(published.map((snapshot) => snapshot.reconciliation.status)).toEqual(["yellow", "red"]);
    expect(subject.snapshot().reconciliation).toMatchObject({ message: "Service declaration scan failed", lastConsistentFingerprint: "unobserved" });
    expect(graph(subject).nodes).toEqual([]); expect(subject.snapshot().jobs).toEqual([]);
  });

  it("never publishes declarations for inputs that changed while reading, then automatically retries current inputs", async () => {
    vi.useFakeTimers(); let samples = 0;
    const discover = vi.fn(async () => declaration), subject = await provider({ discover, fingerprint: async () => ++samples === 1 ? a : b });
    const published: WorkspaceSnapshot[] = [];
    await subject.startReconciliation((_type, snapshot) => published.push(snapshot));
    expect(published.some((snapshot) => snapshot.reconciliation.status === "green")).toBe(false);
    expect(graph(subject).nodes).toEqual([]); expect(subject.snapshot().revisions.working.fingerprint).toBe(b);
    await vi.advanceTimersByTimeAsync(100);
    expect(discover).toHaveBeenCalledTimes(2); expect(subject.snapshot().serviceDeclarations?.sourceFingerprint).toBe(b);
    expect(subject.snapshot().reconciliation.status).toBe("green");
  });

  it("revokes green immediately on source change without relabeling old declaration evidence as current", async () => {
    const subject = await provider(); await subject.startReconciliation(() => {});
    const nodes = structuredClone(graph(subject).nodes);
    const published = vi.fn(); subject.markWorkingWorldChanged(b, published);
    expect(published).toHaveBeenCalledOnce(); expect(published.mock.calls[0]?.[0]).toBe("workspace.changed");
    expect(subject.snapshot().reconciliation.status).toBe("yellow"); expect(graph(subject).reconciliation).toBe("yellow");
    expect(graph(subject).inputFingerprint).toBe(a); expect(subject.snapshot().serviceDeclarations?.sourceFingerprint).toBe(a);
    expect(graph(subject).nodes.map((node) => node.position)).toEqual(nodes.map((node) => node.position));
    expect(subject.snapshot().mappings.every((mapping) => mapping.from.revisionId === b)).toBe(true);
    expect(subject.snapshot().revisions.built.sourceFingerprint).toBe("");
  });

  it("recovers unavailable observer evidence even when its fingerprint is unchanged", async () => {
    const subject = await provider(); await subject.observeWorkingWorld(() => {});
    const events: WorkspaceSnapshot[] = [];
    subject.markWorkingWorldUnknown("git briefly unavailable", (_type, snapshot) => events.push(snapshot));
    subject.markWorkingWorldChanged(a, (_type, snapshot) => events.push(snapshot));
    expect(events.map((snapshot) => snapshot.reconciliation.status)).toEqual(["red", "yellow"]);
    expect(subject.snapshot().revisions.working.evidence).toBe("observed");
    expect(subject.snapshot().reconciliation.message).toContain("service declarations");
  });

  it("bounds a fingerprint preflight failure and never attempts discovery", async () => {
    const discover = vi.fn(async () => declaration), subject = await provider({ discover, fingerprint: async () => { throw new Error("x".repeat(1000)); } });
    const published: WorkspaceSnapshot[] = [];
    await expect(subject.startReconciliation((_type, snapshot) => published.push(snapshot))).resolves.toBeUndefined();
    expect(published.map((snapshot) => snapshot.reconciliation.status)).toEqual(["red"]); expect(discover).not.toHaveBeenCalled();
    expect(subject.snapshot().revisions.working.evidence).toBe("unavailable");
    expect(subject.snapshot().reconciliation.message.length).toBeLessThanOrEqual(460); expect(subject.snapshot().jobs).toEqual([]);
  });

  it.each(["source-change", "disposed"] as const)("aborts and rejects late discovery publication after %s", async (mode) => {
    const pending = deferred<ServiceDiscovery>(); let signal!: AbortSignal;
    const subject = await provider({ discover: async (_root, value) => { signal = value!; return pending.promise; } }), publish = vi.fn();
    const running = subject.startReconciliation(publish); await vi.waitFor(() => expect(signal).toBeDefined());
    if (mode === "source-change") subject.markWorkingWorldChanged(b, publish); else subject.dispose();
    expect(signal.aborted).toBe(true); const before = subject.snapshot(), publications = publish.mock.calls.length;
    pending.resolve(declaration); await running;
    expect(subject.snapshot()).toBe(before); expect(publish).toHaveBeenCalledTimes(publications);
    expect(graph(subject).nodes).toEqual([]);
  });

  it("coalesces overlapping manual refreshes into one owned discovery without stranding its result", async () => {
    const pending = deferred<ServiceDiscovery>(), discover = vi.fn(() => pending.promise), subject = await provider({ discover });
    const first = subject.startReconciliation(() => {}), second = subject.startReconciliation(() => {});
    expect(second).toBe(first); await vi.waitFor(() => expect(discover).toHaveBeenCalledOnce());
    pending.resolve({ ...declaration, issues: ["compose.yaml: unsupported include"] }); await first;
    expect(subject.snapshot().reconciliation.status).toBe("yellow");
    expect(subject.snapshot().serviceDeclarations?.issues).toEqual(["compose.yaml: unsupported include"]);
    expect(subject.snapshot().jobs).toEqual([]);
  });
});
