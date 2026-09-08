// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProductionAgentService, type ProductionAgentService } from "../core/agents/production";
import { RegisteredAgentContextProvider } from "../core/agents/context";
import * as serviceModule from "../core/agents/service";
import * as storeModule from "../core/agents/file-store";
import { RealWorkspaceProvider } from "../core/provider";
import { PROTOCOL_VERSION } from "../protocol/schema";
import type { AgentRequest } from "../protocol/agents";
import { formatRepositoryTask, type AgentTaskReference } from "../protocol/agent-task";
import { createTaskFixture } from "../tools/task-integration/fixture.mjs";

const roots: string[] = [], services: ProductionAgentService[] = [], providers: RealWorkspaceProvider[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.shutdown()));
  providers.splice(0).forEach((provider) => provider.dispose());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(observeWorking = true) {
  const directory = await mkdtemp(join(tmpdir(), "swarm-agent-production-")); roots.push(directory);
  const root = join(directory, "repo"), storeRoot = join(directory, "app-data");
  const path = "services/alpha/main.ts";
  await mkdir(join(root, "services/alpha"), { recursive: true });
  await writeFile(join(root, path), "export const evaluate = () => 'disk';\n");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe", env: {
    ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null",
  } });
  git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  git("add", "."); git("commit", "-qm", "fixture");
  const provider = await RealWorkspaceProvider.create(root);
  providers.push(provider);
  if (observeWorking) await provider.observeWorkingWorld(() => undefined);
  await provider.listRepository({ protocolVersion: PROTOCOL_VERSION, requestId: "fixture-directory", type: "repo.list",
    directory: path.split("/").slice(0, -1).join("/"), page: 0, filter: "", refresh: true }, () => undefined);
  const focus = provider.snapshot().graphs[0]!.nodes.find((node) => node.focus.path === path)!.focus;
  const service = await createProductionAgentService({ root, storeRoot, snapshot: () => provider.snapshot(), emit() {} });
  services.push(service);
  const prepare: AgentRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "prepare", type: "agent.prepare",
    worldId: focus.worldId, focus, taskText: "Explain this actual disk file", model: null, effort: null,
    links: { parentRunId: null, task: null, spec: null } };
  return { service, prepare, root, storeRoot, provider };
}
describe("real production context, no execution authority", () => {
  it("prepares exact CLI-authored pinned metadata without production execution or repository mutation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swarm-agent-production-task-")); roots.push(directory);
    const f = await createTaskFixture(directory);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: f.root, encoding: "utf8" });
    const refs = git("show-ref"), status = git("status", "--porcelain"), config = await readFile(join(f.root, ".git/config"));
    const provider = await RealWorkspaceProvider.create(f.root);
    providers.push(provider);
    await provider.observeWorkingWorld(() => undefined);
    await provider.listRepository({ protocolVersion: PROTOCOL_VERSION, requestId: "task-source", type: "repo.list",
      directory: "src", page: 0, filter: "", refresh: true }, () => undefined);
    const focus = provider.snapshot().graphs[0]!.nodes.find((node) => node.focus.path === f.sourcePath)!.focus;
    const reference: AgentTaskReference = { version: 1, worldId: focus.worldId,
      repositoryId: `repository:${createHash("sha256").update(f.root).digest("hex")}`, provider: "ditz", taskId: f.taskId,
      metadataCommit: f.firstCommit, issueBlob: { algorithm: "sha1", hex: git("rev-parse", `${f.firstCommit.hex}:.ditz/issue-${f.taskId}.yaml`).trim() } };
    const service = await createProductionAgentService({ root: f.root, storeRoot: join(directory, "private"), snapshot: () => provider.snapshot(), emit() {} });
    services.push(service);
    const prepared = await service.request({ protocolVersion: PROTOCOL_VERSION, requestId: "task-prepare", type: "agent.prepare",
      worldId: focus.worldId, focus, taskText: "Explain literal metadata", taskReference: reference,
      model: null, effort: null, links: { parentRunId: null, task: null, spec: null } });
    const content = formatRepositoryTask(reference, f.title, f.description);
    expect(prepared).toMatchObject({ ok: true, value: { kind: "prepare", draft: { launchContext: {
      contextVersion: 2, repositoryTask: { reference, content, bytes: Buffer.byteLength(content), digest: createHash("sha256").update(content).digest("hex") },
      attachments: [{ path: f.sourcePath, content: f.sourceText }],
    } } } });
    if (!prepared.ok || prepared.value.kind !== "prepare") throw new Error("Expected pinned task context");
    expect(await service.request({ protocolVersion: PROTOCOL_VERSION, requestId: "task-launch", type: "agent.launch",
      runId: prepared.value.draft.runId, contextHash: prepared.value.draft.contextHash })).toMatchObject({ ok: false, error: { code: "ADAPTER_POLICY_UNAVAILABLE" } });
    expect(await service.request({ protocolVersion: PROTOCOL_VERSION, requestId: "task-snapshot", type: "agent.snapshot" }))
      .toMatchObject({ ok: true, value: { snapshot: { runs: [], activeRunId: null } } });
    expect(git("show-ref")).toBe(refs); expect(git("status", "--porcelain")).toBe(status);
    expect(await readFile(join(f.root, ".git/config"))).toEqual(config);
    expect(await readFile(join(f.root, f.sourcePath), "utf8")).toBe(f.sourceText);
  }, 30_000);

  it.each(["service", "context"])("shares shutdown with synchronous reentrancy and observes a synchronous %s failure", async (failing) => {
    const creatingContext = vi.spyOn(RegisteredAgentContextProvider, "create");
    const creatingService = vi.spyOn(serviceModule, "createAgentService");
    const creatingStore = vi.spyOn(storeModule, "createFileRunStore");
    const f = await fixture();
    const context = await creatingContext.mock.results[0]!.value, service = await creatingService.mock.results[0]!.value;
    const store = await creatingStore.mock.results[0]!.value;
    await service.shutdown(); await context.dispose();
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const reentered: Promise<void>[] = [], events: string[] = [];
    const drain = (owner: string) => {
      events.push(owner);
      // Avoid recursive overflow on the old implementation while retaining
      // the exact identity/order evidence of one synchronous callback.
      if (events.length <= 2) reentered.push(f.service.shutdown());
      if (owner === failing) throw new Error(`${owner} synchronous failure`);
      return gate;
    };
    vi.spyOn(service, "shutdown").mockImplementation(() => drain("service"));
    vi.spyOn(context, "dispose").mockImplementation(() => drain("context"));
    const close = vi.spyOn(store, "close");
    let closing: Promise<void> | undefined;
    try {
      closing = f.service.shutdown();
      const observed = closing.catch((error: unknown) => error);
      expect(events).toEqual(["service", "context"]);
      expect(reentered).toEqual([closing, closing]);
      await new Promise((resolve) => setImmediate(resolve)); expect(close).not.toHaveBeenCalled();
      release(); expect(await observed).toBeInstanceOf(AggregateError); expect(close).toHaveBeenCalledTimes(1);
    } finally {
      release(); await closing?.catch(() => undefined);
      services.splice(services.indexOf(f.service), 1); await store.close(); vi.restoreAllMocks();
    }
  });

  it.each(["prepare", "revalidate"] as const)("aborts held metadata %s immediately but keeps storage until settlement", async (operation) => {
    const createContext = RegisteredAgentContextProvider.create.bind(RegisteredAgentContextProvider);
    let held = false, entered = false, signal: AbortSignal | undefined, release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let reference!: AgentTaskReference, context!: RegisteredAgentContextProvider;
    vi.spyOn(RegisteredAgentContextProvider, "create").mockImplementation(async (options) => {
      expect(options.taskResolver).toBeDefined();
      reference = { version: 1, worldId: options.worldId, repositoryId: options.repositoryId, provider: "ditz", taskId: "held",
        metadataCommit: { algorithm: "sha1", hex: "a".repeat(40) }, issueBlob: { algorithm: "sha1", hex: "b".repeat(40) } };
      context = await createContext({ ...options, taskResolver: {
        async resolveTask(pin, observedSignal) {
          if (held) { signal = observedSignal; entered = true; await gate; }
          return { reference: pin, title: "Held metadata", description: "Exact task data" };
        }, async checkRevision() {},
      } });
      return context;
    });
    const creatingStore = vi.spyOn(storeModule, "createFileRunStore");
    let pending: Promise<unknown> | undefined;
    try {
      const f = await fixture();
      const store = await creatingStore.mock.results[0]!.value, close = vi.spyOn(store, "close");
      if (f.prepare.type !== "agent.prepare") throw new Error("Expected prepare");
      const input = { ...f.prepare, taskReference: reference };
      const prepared = await f.service.request(input);
      if (!prepared.ok || prepared.value.kind !== "prepare") throw new Error("Expected task draft");
      held = true;
      pending = operation === "prepare" ? f.service.request(input) : context.revalidate(prepared.value.draft);
      await vi.waitFor(() => expect(entered).toBe(true));
      const closing = f.service.shutdown();
      expect(signal?.aborted).toBe(true);
      await new Promise((resolve) => setImmediate(resolve)); expect(close).not.toHaveBeenCalled();
      release(); await closing;
      expect(await pending).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
      expect(close).toHaveBeenCalledTimes(1);
      expect(await context.prepare(input)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    } finally { release(); await pending; vi.restoreAllMocks(); }
  });

  it.each(["neither", "service", "context"])("drains both owners before closing storage when %s fails", async (failing) => {
    const creatingContext = vi.spyOn(RegisteredAgentContextProvider, "create");
    const creatingService = vi.spyOn(serviceModule, "createAgentService");
    const creatingStore = vi.spyOn(storeModule, "createFileRunStore");
    const f = await fixture();
    const context = await creatingContext.mock.results[0]!.value;
    const service = await creatingService.mock.results[0]!.value;
    const store = await creatingStore.mock.results[0]!.value;
    const events: string[] = [];
    let releaseService!: () => void, releaseContext!: () => void;
    const serviceGate = new Promise<void>((resolve) => { releaseService = resolve; });
    const contextGate = new Promise<void>((resolve) => { releaseContext = resolve; });
    const originalShutdown = service.shutdown.bind(service), originalDispose = context.dispose.bind(context);
    const shutdown = vi.spyOn(service, "shutdown").mockImplementation(() => {
      events.push("service"); const drained = originalShutdown();
      return serviceGate.then(async () => { await drained; if (failing === "service") throw new Error("service drain failed"); });
    });
    const dispose = vi.spyOn(context, "dispose").mockImplementation(() => {
      events.push("context"); const drained = originalDispose();
      return contextGate.then(async () => { await drained; if (failing === "context") throw new Error("context drain failed"); });
    });
    const close = vi.spyOn(store, "close");
    let settled = false;
    const closing = f.service.shutdown();
    const observed = closing.then(() => { settled = true; return null; }, (error: unknown) => { settled = true; return error; });
    try {
      expect(events).toEqual(["service", "context"]);
      expect(f.service.shutdown()).toBe(closing);
      if (failing === "context") releaseContext(); else releaseService();
      await new Promise((resolve) => setImmediate(resolve));
      expect(settled).toBe(false); expect(close).not.toHaveBeenCalled();
      releaseService(); releaseContext();
      const error = await observed;
      if (failing === "neither") expect(error).toBeNull(); else expect(error).toBeInstanceOf(Error);
      expect(shutdown).toHaveBeenCalledTimes(1); expect(dispose).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      releaseService(); releaseContext(); await observed;
      services.splice(services.indexOf(f.service), 1);
      await store.close(); vi.restoreAllMocks();
    }
  });

  it("disposes a constructed context before closing storage when service creation fails", async () => {
    const events: string[] = [];
    const createContext = RegisteredAgentContextProvider.create.bind(RegisteredAgentContextProvider);
    const createStore = storeModule.createFileRunStore;
    vi.spyOn(RegisteredAgentContextProvider, "create").mockImplementation(async (options) => {
      const context = await createContext(options), dispose = context.dispose.bind(context);
      vi.spyOn(context, "dispose").mockImplementation(async () => { events.push("context"); await dispose(); });
      return context;
    });
    vi.spyOn(storeModule, "createFileRunStore").mockImplementation(async (root) => {
      const store = await createStore(root), close = store.close.bind(store);
      vi.spyOn(store, "close").mockImplementation(async () => { events.push("store"); await close(); });
      return store;
    });
    vi.spyOn(serviceModule, "createAgentService").mockRejectedValue(new Error("creation failed"));
    try {
      await expect(fixture()).rejects.toThrow("creation failed");
      expect(events).toEqual(["context", "store"]);
    } finally { vi.restoreAllMocks(); }
  });
  it("denies preparation before working evidence and permits it only after observation", async () => {
    const f = await fixture(false);
    expect(f.provider.snapshot().revisions.working).toMatchObject({ fingerprint: "", evidence: "unavailable" });
    expect(await f.service.request(f.prepare)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    await f.provider.observeWorkingWorld(() => undefined);
    if (f.prepare.type !== "agent.prepare") throw new Error("Expected prepare request");
    const path = f.prepare.focus.path;
    const focus = f.provider.snapshot().graphs[0]!.nodes.find((node) => node.focus.path === path)!.focus;
    expect(await f.service.request({ ...f.prepare, focus })).toMatchObject({ ok: true, value: { kind: "prepare" } });
    expect(f.provider.snapshot().reconciliation.status).toBe("yellow");
  });

  it("revokes preparation and revalidation on unavailable evidence even with a retained digest", async () => {
    // Observe the actual context instance constructed by production without
    // replacing its implementation or enabling the production launch policy.
    const creating = vi.spyOn(RegisteredAgentContextProvider, "create");
    const { f, context } = await fixture().then(async (f) => {
      const created = creating.mock.results[0];
      if (created?.type !== "return") throw new Error("Production context was not constructed");
      return { f, context: await created.value };
    }).finally(() => creating.mockRestore());
    const prepared = await f.service.request(f.prepare);
    if (!prepared.ok || prepared.value.kind !== "prepare") throw new Error("Expected prepared disk context");
    const fingerprint = f.provider.snapshot().revisions.working.fingerprint;
    const invalidPath = Buffer.concat([Buffer.from(`${f.root}/invalid-`), Buffer.from([0xff])]);
    await writeFile(invalidPath, "unsupported filename\n");
    await f.provider.observeWorkingWorld(() => undefined);
    // Restore identical disk bytes before checking admission. A stale digest
    // must not become authority merely because the filesystem is readable again.
    await rm(invalidPath);
    expect(f.provider.snapshot().revisions.working).toMatchObject({ fingerprint, evidence: "unavailable" });
    expect(f.provider.snapshot().reconciliation.status).toBe("red");
    expect(await context.revalidate(prepared.value.draft)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    // Public launch fails even earlier at its independent policy gate.
    expect(await f.service.request({ protocolVersion: PROTOCOL_VERSION, requestId: "revalidate-unavailable", type: "agent.launch",
      runId: prepared.value.draft.runId, contextHash: prepared.value.draft.contextHash })).toMatchObject({ ok: false, error: { code: "ADAPTER_POLICY_UNAVAILABLE" } });
    expect(await f.service.request(f.prepare)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    await f.provider.observeWorkingWorld(() => undefined);
    expect(f.provider.snapshot().revisions.working).toMatchObject({ fingerprint, evidence: "observed" });
    expect(f.provider.snapshot().reconciliation.status).toBe("yellow");
    expect(await f.service.request(f.prepare)).toMatchObject({ ok: true, value: { kind: "prepare" } });
    expect(await f.service.request({ protocolVersion: PROTOCOL_VERSION, requestId: "after-recovery", type: "agent.snapshot" }))
      .toMatchObject({ ok: true, value: { kind: "snapshot", snapshot: { runs: [], activeRunId: null } } });
  });

  it("prepares actual disk context while policy-unavailable launch starts no run", async () => {
    const f = await fixture();
    const prepared = await f.service.request(f.prepare);
    expect(prepared).toMatchObject({ ok: true, value: { kind: "prepare", draft: {
      capabilities: { availability: "unavailable", reason: { code: "ADAPTER_POLICY_UNAVAILABLE" } },
      launchContext: { root: f.root, diskOnly: true, attachments: [{ content: "export const evaluate = () => 'disk';\n" }] },
    } } });
    if (!prepared.ok || prepared.value.kind !== "prepare") throw new Error("Missing draft");
    expect(await f.service.request({ protocolVersion: PROTOCOL_VERSION, requestId: "launch", type: "agent.launch",
      runId: prepared.value.draft.runId, contextHash: prepared.value.draft.contextHash })).toMatchObject({ ok: false, error: { code: "ADAPTER_POLICY_UNAVAILABLE" } });
    expect(await f.service.request({ protocolVersion: PROTOCOL_VERSION, requestId: "snapshot", type: "agent.snapshot" })).toMatchObject({ ok: true,
      value: { kind: "snapshot", snapshot: { runs: [], activeRunId: null, capabilities: { policy: "unverified" } } } });
  });
  it("refuses unknown graph mappings and permits reference-only root context", async () => {
    const f = await fixture();
    if (f.prepare.type !== "agent.prepare") throw new Error();
    expect(await f.service.request({ ...f.prepare, focus: { ...f.prepare.focus, key: "not-registered" } })).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    await f.provider.listRepository({ protocolVersion: PROTOCOL_VERSION, requestId: "root-directory", type: "repo.list",
      directory: "", page: 0, filter: "", refresh: true }, () => undefined);
    const focus = f.provider.snapshot().graphs[0]!.nodes[0]!.focus;
    expect(await f.service.request({ ...f.prepare, focus })).toMatchObject({ ok: true,
      value: { kind: "prepare", draft: { launchContext: { attachments: [] } } } });
  });
  it("permits only one live writer and releases it on deliberate shutdown", async () => {
    const f = await fixture();
    await expect(createProductionAgentService({ root: f.root, storeRoot: f.storeRoot, snapshot: () => f.provider.snapshot(), emit() {} })).rejects.toThrow();
    await f.service.shutdown();
    const next = await createProductionAgentService({ root: f.root, storeRoot: f.storeRoot, snapshot: () => f.provider.snapshot(), emit() {} });
    services.push(next);
    expect(await next.request({ protocolVersion: PROTOCOL_VERSION, requestId: "snapshot", type: "agent.snapshot" })).toMatchObject({ ok: true });
  });
});
