import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCodexAppServerAdapter, CODEX_ADAPTER_VERSION, type CodexTransportSink } from "../core/agents/codex-app-server";
import { ProviderJsonl, ProviderLineLimit } from "../core/agents/jsonl";
import type { AdapterCapabilities, AdapterEvent, AgentHandle } from "../core/agents/adapter";
import { AGENT_LIMITS, type PreparedAgentContext, utf8Bytes } from "../protocol/agents";

// Hand-authored deterministic wire fixtures against local stable 0.153.4 JSON
// schemas (v1 initialize, v2 thread/turn/item). No auth, process or model run.
const root = "/registered/repo";
const executable = "/operator/codex";
const at = "2026-09-06T01:00:00.000Z";
const digest = "a".repeat(64);
const caps: AdapterCapabilities = { provider: "codex", version: CODEX_ADAPTER_VERSION, executable,
  available: true, reason: null, supports: { steer: true, interrupt: true, readOnly: true } };
function draft(): PreparedAgentContext {
  const focus = { worldId: "local", revisionKind: "working" as const, revisionId: "working", domain: "repo" as const, key: "file", path: "src/file.ts" };
  return { runId: "11111111-1111-4111-8111-111111111111", contextHash: digest, preparedAt: at, expiresAt: "2026-09-06T01:05:00.000Z",
    capabilities: { availability: "available", reason: null, provider: "codex", version: CODEX_ADAPTER_VERSION,
      controls: { launch: true, steer: true, cancel: true }, policy: "verified-read-only" },
    launchContext: { worldId: "local", repositoryId: "repo", root, head: "a".repeat(40), workingFingerprint: digest, focus,
      taskText: "Explain this interface", links: { parentRunId: null, task: null, spec: null }, requested: { model: "chosen-model", effort: null },
      attachments: [], instructionSources: [], configurationSources: [], submittedPrompt: "Exact submitted bytes é", contextHash: digest, diskOnly: true,
      access: { policy: "read-only", toolNetwork: false, approvals: "never", hostConfidentiality: false, sendsSelectedContentToProvider: true } } };
}
const hello = { userAgent: "codex-cli/0.153.4", codexHome: "/private/not-exported", platformFamily: "unix", platformOs: "linux" };
const thread = { thread: { id: "thread-a" }, model: "observed-model", modelProvider: "openai", cwd: root,
  approvalPolicy: "never", approvalsReviewer: "user", sandbox: { type: "readOnly", networkAccess: false }, instructionSources: ["/registered/repo/AGENTS.md"] };
const turn = (id = "turn-a", status = "inProgress") => ({ id, status, items: [] });
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const handles: AgentHandle[] = [];
afterEach(async () => { for (const handle of handles.splice(0)) await handle.dispose(); vi.useRealTimers(); });
async function fixture(overrides: Partial<AdapterCapabilities> = {}, input = draft(), options: { timeout?: number; throwWrite?: boolean } = {}) {
  let sink!: CodexTransportSink;
  const requests: { id?: number; method?: string; params?: any; result?: any; error?: any }[] = [];
  const events: AdapterEvent[] = [];
  const close = vi.fn(async () => ({ status: "unknown" as const, observedAt: at, detail: "Fixture has no process ownership proof." }));
  const connect = vi.fn((callbacks: CodexTransportSink) => {
    sink = callbacks;
    return { write: (line: string) => { if (options.throwWrite) throw new Error("private transport fault"); requests.push(JSON.parse(line)); }, close };
  });
  const adapter = createCodexAppServerAdapter({ root, executable, probe: async () => ({ ...caps, ...overrides }), connect, requestTimeoutMs: options.timeout });
  const handle = await adapter.start(input, (event) => events.push(event)); handles.push(handle);
  const receive = (message: unknown) => sink.stdout(Buffer.from(JSON.stringify(message) + "\n"));
  const reply = async (method: string, result: unknown) => {
    const request = requests.filter((r) => r.method === method).at(-1);
    expect(request).toBeDefined(); receive({ id: request!.id, result }); await flush();
  };
  const notify = (method: string, params: unknown) => receive({ method, params });
  const setup = async () => { await reply("initialize", hello); await reply("thread/start", thread); };
  const running = async () => { await setup(); await reply("turn/start", { turn: turn() }); };
  const complete = (status = "completed", id = "turn-a") => notify("turn/completed", { threadId: "thread-a", turn: turn(id, status) });
  const delta = (text: string, extra = {}) => notify("item/agentMessage/delta", { threadId: "thread-a", turnId: "turn-a", itemId: "message-a", delta: text, ...extra });
  return { adapter, handle, sink, close, requests, events, receive, reply, notify, setup, running, complete, delta };
}

describe("bounded provider JSONL byte framing", () => {
  it("decodes split multibyte code points and multiple CRLF lines", () => {
    const parser = new ProviderJsonl(), values: unknown[] = [];
    const bytes = Buffer.from('{"text":"é🚀"}\r\n{"ok":true}\n');
    for (const byte of bytes) parser.push(Buffer.from([byte]), (value) => values.push(value));
    parser.end(); expect(values).toEqual([{ text: "é🚀" }, { ok: true }]);
  });
  it("rejects malformed UTF8, JSON, blank lines, partial EOF and oversized lines", () => {
    for (const bytes of [Buffer.from([0xff, 10]), Buffer.from("{broken}\n"), Buffer.from("\n")]) {
      expect(() => new ProviderJsonl().push(bytes, () => {})).toThrow();
    }
    const parser = new ProviderJsonl(); parser.push(Buffer.from("{}"), () => {}); expect(() => parser.end()).toThrow();
    const full = new ProviderJsonl(); full.push(Buffer.alloc(AGENT_LIMITS.providerLineBytes, 32), () => {});
    expect(() => full.push(Buffer.from(" "), () => {})).toThrow(ProviderLineLimit);
  });
});

describe("Codex stable 0.153.4 adapter conformance", () => {
  it("orders handshake, binds operator root, sends exact prompt and reports actual model/policy", async () => {
    const f = await fixture();
    expect(f.requests.map((r) => r.method)).toEqual(["initialize"]);
    await f.running();
    expect(f.requests.map((r) => r.method)).toEqual(["initialize", "initialized", "thread/start", "turn/start"]);
    expect(f.requests[2]!.params).toEqual({ cwd: root, approvalPolicy: "never", sandbox: "read-only", model: "chosen-model", ephemeral: true });
    expect(f.requests[3]!.params.input).toEqual([{ type: "text", text: draft().launchContext.submittedPrompt, text_elements: [] }]);
    expect(f.events[0]).toMatchObject({ type: "started", model: "observed-model", cwd: root, policy: "read-only", instructionPaths: thread.instructionSources });
    expect(f.events[1]).toMatchObject({ type: "turn-started", turnId: "turn-a" });
    expect(JSON.stringify(f.events)).not.toContain("/private/not-exported");
  });
  it("fails closed before connection on mismatched capabilities/root/effort/extra authority", async () => {
    const connect = vi.fn();
    for (const probe of [async () => ({ ...caps, supports: { ...caps.supports, readOnly: false } }), async () => ({ ...caps, executable: "/other" }), async () => ({ ...caps, version: "future" })]) {
      const adapter = createCodexAppServerAdapter({ root, executable, probe, connect });
      expect((await adapter.probe()).available).toBe(false);
      await expect(adapter.start(draft(), () => {})).rejects.toThrow();
    }
    const adapter = createCodexAppServerAdapter({ root, executable, probe: async () => caps, connect });
    const badRoot = draft(); badRoot.launchContext.root = "/elsewhere";
    const effort = draft(); effort.launchContext.requested.effort = "ultra";
    const unavailable = draft(); unavailable.capabilities = { availability: "unavailable", reason: { code: "ADAPTER_POLICY_UNAVAILABLE", message: "Unverified policy" },
      provider: "codex", version: CODEX_ADAPTER_VERSION, controls: { launch: false, steer: false, cancel: false }, policy: "unverified" };
    const changedVersion = draft(); changedVersion.capabilities.version = "old";
    for (const input of [badRoot, effort, unavailable, changedVersion, { ...draft(), executable: "/bad" }]) await expect(adapter.start(input, () => {})).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
    expect(() => createCodexAppServerAdapter({ root, executable: "codex" })).toThrow();
  });
  it("retains observed unsupported version or unknown instead of inventing the conformance baseline", async () => {
    for (const version of ["0.146.0", "unknown"]) {
      const adapter = createCodexAppServerAdapter({ root, executable, probe: async () => ({ ...caps, version }) });
      expect(await adapter.probe()).toMatchObject({ version, available: false, reason: { code: "ADAPTER_UNAVAILABLE" } });
    }
  });
  it.each([
    { cwd: "/other" }, { model: 42 }, { model: "spoof\u202e" }, { instructionSources: [42] },
    { approvalPolicy: "on-request" }, { sandbox: { type: "dangerFullAccess" } },
    { sandbox: { type: "readOnly" } },
    { sandbox: { type: "readOnly", networkAccess: true } }, { sandbox: { type: "readOnly", mysteryAuthority: true } },
  ])("rejects bad thread evidence without any turn: %j", async (change) => {
    const f = await fixture(); await f.reply("initialize", hello); await f.reply("thread/start", { ...thread, ...change });
    expect(f.requests.some((r) => r.method === "turn/start")).toBe(false);
    expect(f.events).toContainEqual(expect.objectContaining({ type: "error", dispatch: "not-sent" }));
    expect(f.events).toContainEqual(expect.objectContaining({ type: "terminal", outcome: expect.objectContaining({ kind: "setup-rejected" }) }));
    expect(f.close).toHaveBeenCalledOnce();
  });
  it("retains early deltas, handles terminal before start reply and ignores late duplicates", async () => {
    const f = await fixture(); await f.setup();
    f.delta("early "); f.delta("text"); f.complete();
    await f.reply("turn/start", { turn: turn() }); f.complete("failed");
    f.notify("turn/started", { threadId: "thread-a", turn: turn() }); f.delta("late");
    expect(f.events.filter((e) => e.type === "turn-started")).toHaveLength(1);
    expect(f.events.filter((e) => e.type === "terminal")).toHaveLength(1);
    expect(f.events.filter((e) => e.type === "item").map((e) => e.text).join("")).toBe("early text");
    expect(f.events.find((e) => e.type === "terminal")).toMatchObject({ outcome: { status: "completed" } });
  });
  it("streams commentary/final as text, deduplicates completed items and excludes reasoning", async () => {
    const f = await fixture(); await f.running();
    f.notify("item/started", { threadId: "thread-a", turnId: "turn-a", item: { type: "agentMessage", id: "message-a", text: "", phase: "commentary" } });
    f.delta("hello "); f.delta("hello "); // identical deltas can legitimately repeat
    const params = { threadId: "thread-a", turnId: "turn-a", item: { type: "agentMessage", id: "message-a", text: "hello hello final", phase: "final_answer" } };
    f.notify("item/completed", params); f.notify("item/completed", params);
    f.notify("item/completed", { ...params, item: { id: "secret", type: "reasoning", content: ["DO NOT PUBLISH"] } });
    f.notify("item/reasoning/textDelta", { delta: "DO NOT PUBLISH" });
    f.complete();
    expect(f.events.filter((e) => e.type === "item").map((e) => e.text).join("")).toBe("hello hello final");
  });
  it("does not infer completion from start response, final message, retry error, or exit zero", async () => {
    const f = await fixture(); await f.setup(); await f.reply("turn/start", { turn: turn("turn-a", "completed") });
    f.notify("item/completed", { threadId: "thread-a", turnId: "turn-a", item: { type: "agentMessage", id: "final", text: "done", phase: "final_answer" } });
    f.notify("error", { threadId: "thread-a", turnId: "turn-a", error: { message: "private diagnostic" }, willRetry: true });
    f.sink.exit(0); f.sink.end(); await flush();
    expect(f.events.some((e) => e.type === "terminal")).toBe(false);
    expect(f.events).toContainEqual(expect.objectContaining({ type: "error", dispatch: "unknown" }));
    expect(JSON.stringify(f.events)).not.toContain("private diagnostic");
  });
  it.each(["completed", "failed", "interrupted"])("normalizes actual terminal %s separately from exit/cleanup", async (status) => {
    const f = await fixture(); await f.running(); f.complete(status); f.sink.exit(1); f.sink.exit(1); f.sink.end();
    expect(f.events.filter((e) => e.type === "terminal")).toEqual([expect.objectContaining({ outcome: expect.objectContaining({ status }) })]);
    expect(f.events.filter((e) => e.type === "process-exit")).toHaveLength(1);
    expect(await f.handle.dispose()).toMatchObject({ status: "unknown" });
    expect(f.close).toHaveBeenCalledOnce();
  });
  it("acknowledges steering only with a correlated reply even after completion; Stop ack is not cancellation", async () => {
    const f = await fixture(); await f.running();
    expect(await f.handle.steer("old", "text")).toMatchObject({ ok: false, error: { code: "STALE_TURN" } });
    const steer = f.handle.steer("turn-a", "focus on failures");
    expect(await f.handle.steer("turn-a", "second")).toMatchObject({ error: { code: "BUSY" } });
    const stop = f.handle.interrupt();
    await f.reply("turn/interrupt", {}); expect(await stop).toEqual({ ok: true, value: { status: "requested" } });
    expect(f.events.some((e) => e.type === "terminal")).toBe(false);
    f.complete(); await f.reply("turn/steer", { turnId: "turn-a" });
    expect(await steer).toEqual({ ok: true, value: { status: "accepted" } });
    expect(f.events.find((e) => e.type === "terminal")).toMatchObject({ outcome: { status: "completed" } });
  });
  it("handles rejected steering without starting a new turn or leaking provider error text", async () => {
    const f = await fixture(); await f.running(); const steering = f.handle.steer("turn-a", "text");
    const id = f.requests.at(-1)!.id; f.receive({ id, error: { code: -32602, message: "secret provider detail" } });
    expect(await steering).toMatchObject({ ok: false, error: { code: "RUN_NOT_ACTIVE" } });
    expect(f.requests.filter((r) => r.method === "turn/start")).toHaveLength(1);
    expect(JSON.stringify(f.events)).not.toContain("secret provider detail");
  });
  it.each([{ turnId: "other" }, { turnId: 42 }, {}])("bad steer acknowledgement means unknown, not accepted: %j", async (response) => {
    const f = await fixture(); await f.running(); const steering = f.handle.steer("turn-a", "text");
    await f.reply("turn/steer", response);
    expect(await steering).toMatchObject({ ok: false, error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(f.close).toHaveBeenCalledOnce();
  });
  it("times out pending commands once, never replays and preserves known terminal evidence", async () => {
    vi.useFakeTimers(); const f = await fixture({}, draft(), { timeout: 5 }); await f.running();
    const steering = f.handle.steer("turn-a", "text"); f.complete(); await vi.advanceTimersByTimeAsync(6);
    expect(await steering).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(f.events.filter((e) => e.type === "terminal")).toHaveLength(1);
    expect(f.requests.filter((r) => r.method === "turn/steer")).toHaveLength(1);
  });
  it("ignores optional notifications and stale turn data but rejects malformed lifecycle", async () => {
    const f = await fixture(); await f.running();
    f.notify("future/telemetry", { arbitrary: { data: true } }); f.delta("stale", { turnId: "old" }); f.complete("completed", "old");
    expect(f.events).toHaveLength(2);
    f.notify("turn/completed", { threadId: "thread-a", turn: { id: "turn-a", status: "maybe" } });
    expect(f.events.at(-1)).toMatchObject({ type: "error", dispatch: "unknown" });
  });
  it("declines known approvals and rejects unknown required requests with bounded safe stop", async () => {
    for (const method of ["item/commandExecution/requestApproval", "item/fileChange/requestApproval", "future/dangerousRequest"]) {
      const f = await fixture(); await f.running(); f.receive({ id: "provider-request", method, params: { private: "secret" } });
      expect(f.requests.at(-1)).toEqual(method.startsWith("item/") ? { id: "provider-request", result: { decision: "cancel" } }
        : { id: "provider-request", error: { code: -32601, message: "Unsupported provider request in read-only analysis." } });
      expect(f.events.at(-1)).toMatchObject({ type: "error", error: { code: "ADAPTER_POLICY_UNAVAILABLE" } });
      await flush();
      expect(f.close).toHaveBeenCalledOnce();
    }
  });
  it("bounds early-event buffers, normalized records, raw lines, stderr and missing-newline EOF", async () => {
    const early = await fixture(); await early.setup(); for (let i = 0; i < 33; i++) early.delta("");
    expect(early.events.at(-1)).toMatchObject({ type: "error", error: { code: "OUTPUT_LIMIT" } });
    const f = await fixture(); await f.running(); f.delta("🚀".repeat(20_000));
    const records = f.events.filter((e) => e.type === "item"); expect(records).toHaveLength(2);
    expect(records.every((e) => utf8Bytes(e.text) <= AGENT_LIMITS.recordBytes && !e.text.includes("�"))).toBe(true);
    const huge = await fixture(); huge.sink.stdout(Buffer.alloc(AGENT_LIMITS.providerLineBytes + 1, 32));
    expect(huge.events.find((e) => e.type === "error")).toMatchObject({ error: { code: "OUTPUT_LIMIT" } });
    const err = await fixture(); await err.running(); for (let i = 0; i < 33; i++) err.sink.stderr(Buffer.alloc(1024 * 1024));
    expect(err.events.at(-1)).toMatchObject({ type: "error", error: { code: "OUTPUT_LIMIT" } });
    const eof = await fixture(); await eof.running(); eof.sink.stdout(Buffer.from('{"unfinished":')); eof.sink.end();
    expect(eof.events.at(-1)).toMatchObject({ type: "error", dispatch: "unknown" });
  });
  it("prevents setup turn on disposal and treats write failure as uncertain rather than retryable", async () => {
    const f = await fixture(); await f.handle.dispose(); await f.reply("initialize", hello);
    expect(f.requests).toHaveLength(1); expect(f.close).toHaveBeenCalledOnce();
    const broken = await fixture({}, draft(), { throwWrite: true }); await flush();
    expect(broken.events).toContainEqual(expect.objectContaining({ type: "error", dispatch: "not-sent" }));
    expect(broken.close).toHaveBeenCalledOnce();
  });
  it("drains stdout terminal/reply bytes after process exit, then emits exit independently", async () => {
    const f = await fixture(); await f.running(); const steering = f.handle.steer("turn-a", "text");
    f.sink.exit(0); f.delta("buffered final"); f.complete(); await f.reply("turn/steer", { turnId: "turn-a" }); f.sink.end();
    expect(await steering).toMatchObject({ ok: true });
    expect(f.events.at(-2)).toMatchObject({ type: "terminal", outcome: { status: "completed" } });
    expect(f.events.at(-1)).toMatchObject({ type: "process-exit", exitCode: 0 });
    expect(f.events.some((e) => e.type === "error")).toBe(false);
  });
  it("bounds drain when descendants hold stdout open and does not wait forever", async () => {
    vi.useFakeTimers(); const f = await fixture({}, draft(), { timeout: 5 }); await f.running(); f.sink.exit(0);
    await vi.advanceTimersByTimeAsync(6);
    expect(f.events).toContainEqual(expect.objectContaining({ type: "process-exit" }));
    expect(f.events.at(-1)).toMatchObject({ type: "error", dispatch: "unknown" });
    f.complete(); expect(f.events.some((e) => e.type === "terminal")).toBe(false);
  });
  it("closes once when the transport reports synchronous failure before open returns", async () => {
    const close = vi.fn(async () => ({ status: "unknown" as const, observedAt: at, detail: "fixture cleanup" }));
    const write = vi.fn();
    const adapter = createCodexAppServerAdapter({ root, executable, probe: async () => caps,
      connect(sink) { sink.error(); return { close, write }; } });
    const handle = await adapter.start(draft(), () => {}); handles.push(handle);
    await handle.dispose(); await handle.dispose();
    expect(close).toHaveBeenCalledOnce(); expect(write).not.toHaveBeenCalled();
  });
  it("rejects new controls during exit drain without discarding buffered terminal evidence", async () => {
    const f = await fixture(); await f.running(); f.sink.exit(0);
    expect(await f.handle.steer("turn-a", "too late")).toMatchObject({ error: { code: "RUN_NOT_ACTIVE" } });
    expect(await f.handle.interrupt()).toMatchObject({ error: { code: "RUN_NOT_ACTIVE" } });
    expect(f.requests).toHaveLength(4);
    f.delta("buffered final"); f.complete(); f.sink.end();
    expect(f.events.some((e) => e.type === "error")).toBe(false);
    expect(f.events).toContainEqual(expect.objectContaining({ type: "terminal", outcome: expect.objectContaining({ status: "completed" }) }));
  });
  it("uses the fixed stdio argv with a real deterministic child, never a model", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swarm-adapter-fixture-"));
    const program = join(directory, "fixture-codex");
    const events: AdapterEvent[] = [];
    let handle: AgentHandle | undefined;
    try {
      await writeFile(program, `#!${process.execPath}
const readline = require('node:readline');
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['app-server', '--listen', 'stdio://'])) process.exit(2);
const reply = (id, result) => process.stdout.write(JSON.stringify({id, result}) + '\\n');
readline.createInterface({input: process.stdin}).on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') reply(message.id, ${JSON.stringify(hello)});
  if (message.method === 'thread/start') reply(message.id, {...${JSON.stringify(thread)}, cwd: process.cwd()});
  if (message.method === 'turn/start') {
    reply(message.id, {turn: ${JSON.stringify(turn())}});
    process.stderr.write('PRIVATE STDERR NEVER PUBLISH');
    process.stdout.write(JSON.stringify({method: 'turn/completed', params: {threadId: 'thread-a', turn: ${JSON.stringify(turn('turn-a', 'completed'))}}}) + '\\n', () => process.exit(0));
  }
});
`, { mode: 0o700 });
      const input = draft(); input.launchContext.root = directory;
      const adapter = createCodexAppServerAdapter({ root: directory, executable: program, probe: async () => ({ ...caps, executable: program }) });
      handle = await adapter.start(input, (event) => events.push(event));
      await vi.waitFor(() => expect(events.some((e) => e.type === "process-exit")).toBe(true));
      expect(events).toContainEqual(expect.objectContaining({ type: "terminal", outcome: expect.objectContaining({ status: "completed" }) }));
      expect(events.at(-1)).toMatchObject({ type: "process-exit", exitCode: 0 });
      expect(events.some((e) => e.type === "error")).toBe(false);
      expect(JSON.stringify(events)).not.toContain("PRIVATE STDERR");
      expect(await handle.dispose()).toMatchObject({ status: "unknown" });
    } finally {
      await handle?.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("escapes invisible output controls and bounds aggregate output, IDs and malformed envelopes", async () => {
    const f = await fixture(); await f.running(); f.delta("visible\u202e\u001b\n\t");
    expect(f.events.at(-1)).toMatchObject({ type: "item", text: "visible[U+202E][U+001B]\n\t" });
    const limit = await fixture(); await limit.running();
    for (let i = 0; i < 130; i++) limit.delta("x".repeat(64 * 1024), { itemId: `m${i}` });
    expect(limit.events.at(-1)).toMatchObject({ type: "error", error: { code: "OUTPUT_LIMIT" } });
    const ids = await fixture(); await ids.running(); for (let i = 0; i < 2049; i++) ids.delta("", { itemId: `m${i}` });
    expect(ids.events.at(-1)).toMatchObject({ type: "error", error: { code: "OUTPUT_LIMIT" } });
    for (const bad of [null, [], { id: 999, result: {} }, { id: 1, result: {}, error: {} }, { method: "turn/started", params: { threadId: 42 } }]) {
      const invalid = await fixture(); invalid.receive(bad);
      expect(invalid.events.find((e) => e.type === "error")).toBeDefined();
    }
  });
});
