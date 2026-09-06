/** TEST ONLY: fixed automation of the real W2 UI and preload bridge.
 * No bridge replacement, renderer fixture control, live provider, or process-
 * ownership claim. The caller owns the window, core and failure cleanup.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { AGENT_LIMITS, type AgentResult, type AgentSnapshot, type Run } from "../../protocol/agents";
import { PROTOCOL_VERSION, type CoreResponse } from "../../protocol/schema";

const IMPLEMENTATION = "examples/checkout-world/services/fraudcheck/fraudcheck.ts";
const CONTRACT = "examples/checkout-world/services/fraudcheck/fraudcheck.proto";
const FIRST_TASK = "FIXTURE ONLY: explain FraudCheck inputs, outputs and interface failures.";
const SECOND_TASK = "FIXTURE ONLY: inspect the protobuf contract; demonstrate unknown delivery.";

type RendererAction =
  | { action: "observe" | "remember" | "continuity" | "install-observer" | "ledger" | "palette" | "confirm" | "remove-observer" }
  | { action: "click"; label: string }
  | { action: "text"; field: "task" | "instruction"; value: string }
  | { action: "read"; runId?: string; afterRecord?: number; version: typeof PROTOCOL_VERSION };
type UiObservation = {
  source: string | null; editor: boolean; graphs: number; state: string | null;
  draftFocus: string | null; context: string; receipts: string[]; evidence: string; notice: string;
  transcriptRecords: number; transcriptBytes: number; literalHtml: boolean; multibyte: boolean;
  injectedElements: number; cursor: number | null; buttons: { label: string; disabled: boolean }[];
};
type Ledger = {
  events: { sequence: number; active: string | null; runs: { runId: string; state: string }[]; tailRecords: number }[];
  lifecycle: { generation: number; phase: string }[];
  overflow: boolean;
};

// Serialized only after Bazel compiles TypeScript. This closed function never
// references privileged functions or accepts arbitrary JavaScript/selectors.
async function rendererAction(input: RendererAction): Promise<unknown> {
  type Memory = Ledger & {
    graphs: Element[]; cameras: string[]; editor: Element | null; source: string | null; text: string;
    offEvents?: () => void; offLifecycle?: () => void;
  };
  const target = window as Window & { __agentJourneyObservation?: Memory };
  const source = () => document.querySelector(".source-surface > header strong")?.textContent ?? null;
  const memory = target.__agentJourneyObservation;
  const elements = () => [...document.querySelectorAll(".react-flow")];
  const cameras = () => [...document.querySelectorAll<HTMLElement>(".react-flow__viewport")].map((node) => node.style.transform);
  const buttons = () => [...document.querySelectorAll<HTMLButtonElement>("button")];
  if (input.action === "install-observer") {
    if (memory) throw new Error("Journey observer already installed");
    if (!window.swarm || !window.swarmLifecycle) throw new Error("Actual desktop preload bridges missing");
    const saved: Memory = { events: [], lifecycle: [], overflow: false, graphs: elements(), cameras: cameras(),
      editor: null, source: null, text: "" };
    saved.offEvents = window.swarm.onEvent((event) => {
      if (event.type !== "agent.changed") return;
      if (saved.events.length >= 512) { saved.overflow = true; return; }
      saved.events.push({ sequence: event.sequence, active: event.snapshot.activeRunId,
        runs: event.snapshot.runs.map(({ runId, state }) => ({ runId, state })), tailRecords: event.snapshot.tail.length });
    });
    saved.offLifecycle = window.swarmLifecycle.onStatus((status) => {
      if (saved.lifecycle.length >= 128) { saved.overflow = true; return; }
      saved.lifecycle.push({ generation: status.core.generation, phase: status.core.phase });
    });
    const status = await window.swarmLifecycle.status();
    saved.lifecycle.push({ generation: status.core.generation, phase: status.core.phase });
    target.__agentJourneyObservation = saved;
    return true;
  }
  if (input.action === "remove-observer") {
    memory?.offEvents?.(); memory?.offLifecycle?.(); delete target.__agentJourneyObservation; return true;
  }
  if (input.action === "remember") {
    if (!memory) throw new Error("Journey observer missing");
    memory.editor = document.querySelector(".cm-editor"); memory.source = source();
    memory.cameras = cameras(); // New baseline after deliberate navigation/Reveal only.
    memory.text = document.querySelector(".cm-content")?.textContent ?? "";
    return true;
  }
  if (input.action === "continuity") {
    if (!memory) throw new Error("Journey observer missing");
    const current = elements();
    return { graphs: current.length === memory.graphs.length && current.every((node, index) => node === memory.graphs[index]),
      cameras: JSON.stringify(cameras()) === JSON.stringify(memory.cameras), source: source() === memory.source,
      editor: document.querySelector(".cm-editor") === memory.editor,
      sourceText: document.querySelector(".cm-content")?.textContent === memory.text };
  }
  if (input.action === "ledger") {
    if (!memory) throw new Error("Journey observer missing");
    return { events: memory.events, lifecycle: memory.lifecycle, overflow: memory.overflow };
  }
  if (input.action === "read") {
    if (!window.swarm) throw new Error("Actual preload bridge missing");
    const common = { protocolVersion: input.version, requestId: `journey-observer:${crypto.randomUUID()}` };
    return window.swarm.request(input.runId ? { ...common, type: "agent.read", runId: input.runId, afterRecord: input.afterRecord ?? 0 }
      : { ...common, type: "agent.snapshot" });
  }
  if (input.action === "palette") {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })); return true;
  }
  if (input.action === "click") {
    const candidates = buttons().filter((button) => button.getAttribute("aria-label") === input.label || button.textContent?.trim() === input.label ||
      (button.closest(".command-results") && button.querySelector("span")?.firstChild?.textContent === input.label));
    if (candidates.length !== 1 || candidates[0]!.disabled) throw new Error(`Expected exactly one enabled UI control: ${input.label}`);
    candidates[0]!.click(); return true;
  }
  if (input.action === "text") {
    const field = document.querySelector<HTMLTextAreaElement>(input.field === "task" ? ".agent-draft textarea" : "textarea[aria-label='Instruction to this run']");
    if (!field) throw new Error(`Missing UI textarea: ${input.field}`);
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, input.value);
    field.dispatchEvent(new Event("input", { bubbles: true })); return true;
  }
  if (input.action === "confirm") {
    const field = document.querySelector<HTMLInputElement>(".agent-confirm input[type=checkbox]");
    if (!field || field.checked) throw new Error("Expected unchecked context inspection confirmation");
    field.click(); return true;
  }
  const transcript = document.querySelector("[aria-label='Agent transcript']");
  const text = transcript?.textContent ?? "";
  const cursor = document.querySelector(".agent-pagination small")?.textContent?.match(/cursor (\d+)/);
  return {
    source: source(), editor: Boolean(document.querySelector(".cm-editor")), graphs: elements().length,
    state: document.querySelector(".agent-pane-header .agent-state")?.textContent ?? null,
    draftFocus: document.querySelector(".agent-draft > .agent-context-path")?.textContent ?? null,
    context: document.querySelector(".agent-draft .agent-launch-context")?.textContent?.slice(0, 16_384) ?? "",
    receipts: [...document.querySelectorAll(".agent-receipts summary")].map((node) => node.textContent ?? ""),
    evidence: document.querySelector(".agent-output > .agent-evidence")?.textContent?.slice(0, 4096) ?? "",
    notice: document.querySelector(".agent-rail [role=status]")?.textContent?.slice(0, 2000) ?? "",
    transcriptRecords: transcript?.querySelectorAll(".agent-record").length ?? 0,
    transcriptBytes: new TextEncoder().encode(text).byteLength,
    literalHtml: text.includes("<img src=x onerror=alert('fixture')>"), multibyte: text.includes("réponse 🧪"),
    injectedElements: transcript?.querySelectorAll("img,script,iframe,svg").length ?? 0,
    cursor: cursor ? Number(cursor[1]) : null,
    buttons: buttons().map((button) => ({ label: button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "", disabled: button.disabled })),
  } satisfies UiObservation;
}

type Diagnostics = {
  fixture: string; externalProcesses: number; ledgerComplete: boolean;
  totals: { start: number; steer: number; interrupt: number; dispose: number };
  runs: { runId: string; invocations: { method: string; turnId?: string; textBytes?: number }[] }[];
};

export async function runJourney(options: {
  window: BrowserWindow; control(input: unknown): Promise<unknown>; crashCore(): void; artifactDirectory: string;
}): Promise<Record<string, unknown>> {
  const { window: ownedWindow, control, artifactDirectory } = options;
  const started = Date.now();
  const checkpoints: Record<string, unknown>[] = [];
  let stage = "opening source";
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  const evaluate = <T>(input: RendererAction) => ownedWindow.webContents.executeJavaScript(`(${rendererAction.toString()})(${JSON.stringify(input)})`) as Promise<T>;
  const observe = () => evaluate<UiObservation>({ action: "observe" });
  const until = async <T>(label: string, read: () => Promise<T>, accepts: (value: T) => boolean, milliseconds = 10_000): Promise<T> => {
    const deadline = Date.now() + milliseconds;
    do {
      const value = await read();
      if (accepts(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 35));
    } while (Date.now() < deadline);
    throw new Error(`Journey timeout: ${label} (stage ${stage})`);
  };
  const ui = (label: string, accepts: (value: UiObservation) => boolean) => until(label, observe, accepts);
  const click = async (label: string) => {
    await ui(`enabled ${label}`, (value) => value.buttons.some((button) => button.label === label && !button.disabled));
    await evaluate({ action: "click", label });
  };
  const snapshot = async () => {
    const result = await evaluate<CoreResponse>({ action: "read", version: PROTOCOL_VERSION });
    assert(result.ok && result.agent?.kind === "snapshot", "actual bridge snapshot reply");
    return result.agent.snapshot;
  };
  const read = async (runId: string, afterRecord = 0) => {
    const result = await evaluate<CoreResponse>({ action: "read", runId, afterRecord, version: PROTOCOL_VERSION });
    assert(result.ok && result.agent?.kind === "read", "actual bridge durable read reply");
    return result.agent as Extract<AgentResult, { kind: "read" }>;
  };
  const diagnostics = async () => {
    const value = await control({ action: "diagnostics" }) as Diagnostics;
    assert.equal(value.externalProcesses, 0); assert.equal(value.ledgerComplete, true); return value;
  };
  const screenshot = async (name: string) => {
    const capture = await ownedWindow.webContents.capturePage();
    assert(!capture.isEmpty(), "nonempty owned-window screenshot");
    await writeFile(join(artifactDirectory, `${name}.png`), capture.toPNG(), { mode: 0o600 });
  };
  const continuity = async (label: string) => {
    const proof = await evaluate<Record<string, boolean>>({ action: "continuity" });
    assert(Object.values(proof).every(Boolean), `${label}: source/editor/graphs/cameras continuity ${JSON.stringify(proof)}`);
    checkpoints.push({ stage: label, ...proof });
  };
  const openContract = async () => {
    await evaluate({ action: "palette" });
    // Palette buttons include descriptive children, so only this fixed action
    // uses the closed function's label matcher instead of flattened button text.
    await until("command palette", async () => {
      try { return await evaluate<boolean>({ action: "click", label: "Open FraudCheck protobuf contract" }); } catch { return false; }
    }, Boolean);
    await ui("protobuf source ready", (value) => value.source === CONTRACT && value.editor);
  };
  const prepare = async (task: string) => {
    await evaluate({ action: "text", field: "task", value: task });
    await click("Prepare disk context");
    await ui("inspectable prepared context", (value) => value.context.includes("Context hash:") && value.context.includes("not a frozen filesystem"));
    await evaluate({ action: "confirm" });
  };
  const receipt = (run: Run, index: number, status: string) => run.instructions[index]?.status === status;
  try {
    await ui("source and both graphs", (value) => value.source === IMPLEMENTATION && value.editor && value.graphs === 2);
    // Let initial React Flow fitView settle before preserving its real cameras.
    await new Promise((resolve) => setTimeout(resolve, 250));
    await evaluate({ action: "install-observer" });
    assert.equal((await snapshot()).runs.length, 0, "owned demonstration starts with empty private history");
    stage = "fixed-focus draft";
    await click("Ask an agent about this focus");
    await ui("draft captures implementation", (value) => value.draftFocus === IMPLEMENTATION);
    await openContract();
    await ui("navigation cannot retarget draft", (value) => value.source === CONTRACT && value.draftFocus === IMPLEMENTATION);
    await prepare(FIRST_TASK);
    const preparedUi = await observe();
    assert(preparedUi.context.includes(IMPLEMENTATION));
    assert(preparedUi.context.includes("Instruction source observations"));
    assert(preparedUi.context.includes("Configuration source observations"));
    await screenshot("01-inspected-fixed-focus-draft");
    await click("Launch read-only run");
    const admitted = await until("one durable admission", snapshot, (value) => value.runs.length === 1 && value.activeRunId !== null);
    const first = admitted.activeRunId!;
    assert.equal((await read(first)).run.state, "starting");
    await until("one fixture dispatch after durable admission", diagnostics, (value) => value.totals.start === 1);
    await ui("admission accepted before work", (value) => value.state === "starting" && value.receipts.includes("launch · accepted"));
    await click("Reveal launch focus");
    await ui("explicit Reveal implementation", (value) => value.source === IMPLEMENTATION && value.editor);
    await evaluate({ action: "remember" });
    stage = "streaming and accepted steering";
    await control({ action: "start-observed", runId: first });
    await control({ action: "output", runId: first, count: 40 });
    await ui("bounded literal output", (value) => value.state === "running" && value.literalHtml && value.multibyte && value.transcriptRecords <= AGENT_LIMITS.tailRecords);
    assert.equal((await observe()).injectedElements, 0, "HTML remains literal text");
    await continuity("active output beside retained source and graphs");
    await screenshot("02-active-output-source-graphs");
    await evaluate({ action: "text", field: "instruction", value: "FIXTURE: focus on interface contract failures instead." });
    await click("Send to this run");
    await until("durable pending steer", () => read(first), (value) => receipt(value.run, 0, "pending"));
    await until("adapter received first steer", diagnostics, (value) => value.totals.steer === 1);
    await control({ action: "steer-accepted", runId: first });
    await until("durable accepted steer", () => read(first), (value) => receipt(value.run, 0, "accepted"));
    await ui("accepted instruction UI", (value) => value.receipts.includes("Instruction · accepted"));
    await evaluate({ action: "text", field: "instruction", value: "FIXTURE: this deliberately late instruction must not be retried." });
    await click("Send to this run");
    await until("adapter received stale-boundary steer", diagnostics, (value) => value.totals.steer === 2);
    await control({ action: "steer-stale", runId: first });
    const stale = await until("durable stale rejection", () => read(first), (value) => receipt(value.run, 1, "rejected"));
    assert.equal(stale.run.instructions[1]!.error?.code, "STALE_TURN");
    await ui("retained stale receipt UI", (value) => value.receipts.includes("Instruction · rejected"));
    await screenshot("03-steering-accepted-and-stale");
    stage = "Stop completion race";
    await click("Stop");
    await until("adapter received Stop", diagnostics, (value) => value.totals.interrupt === 1);
    await control({ action: "interrupt-accepted", runId: first });
    await ui("Stop accepted not terminal", (value) => value.state === "cancelling" && value.receipts.includes("Stop · accepted"));
    await control({ action: "terminal-completed", runId: first });
    await ui("completion independent of cleanup", (value) => value.state === "completed" && value.evidence.includes("cleanup: pending") && value.evidence.includes("despite the Stop request"));
    // Service disposal is bounded at two seconds. Do not add long manual waits.
    const completedLive = await read(first);
    assert.equal(completedLive.run.processState, "live");
    assert.equal(completedLive.run.exitCode, null);
    await screenshot("04-completed-cleanup-pending");
    await control({ action: "cleanup-confirmed", runId: first });
    const completed = await until("durable cleanup", () => read(first), (value) => value.run.cleanup.status === "confirmed");
    assert.equal(completed.run.state, "completed"); assert.equal(completed.run.exitCode, null);
    assert.match(completed.run.cleanup.detail, /fixture|in-process/i);
    await ui("UI cleanup agrees", (value) => value.state === "completed" && value.evidence.includes("cleanup: confirmed"));
    checkpoints.push({ stage, state: completed.run.state, providerOutcome: completed.run.providerOutcome.kind,
      beforeCleanup: completedLive.run.cleanup.status, afterCleanup: completed.run.cleanup.status,
      exitCode: completed.run.exitCode, cleanupDetail: completed.run.cleanup.detail });
    stage = "bounded historical paging";
    // Late output cannot alter terminal history. Paging volume must therefore
    // be emitted on the next active fixture, not fabricated into this record.
    await openContract();
    await click("Ask an agent about this focus");
    await prepare(SECOND_TASK);
    await click("Launch read-only run");
    const secondSnapshot = await until("second explicit admission", snapshot, (value) => value.runs.length === 2 && value.activeRunId !== null);
    const second = secondSnapshot.activeRunId!;
    assert.notEqual(second, first);
    await until("second explicit fixture dispatch", diagnostics, (value) => value.totals.start === 2);
    await control({ action: "start-observed", runId: second });
    await control({ action: "output", runId: second, count: 40, repeat: 256 });
    const fullFirstPage = await read(second);
    assert(fullFirstPage.run.transcript.bytes > AGENT_LIMITS.pageBytes);
    assert(fullFirstPage.page.nextCursor < fullFirstPage.run.transcript.lastRecord);
    assert(Buffer.byteLength(JSON.stringify(fullFirstPage.page.records)) <= AGENT_LIMITS.pageBytes);
    await click("Read transcript from start");
    await ui("first bounded page", (value) => value.cursor === fullFirstPage.page.nextCursor);
    await click("Read next transcript page");
    await ui("second bounded page advances", (value) => value.cursor !== null && value.cursor > fullFirstPage.page.nextCursor);
    const paged = await observe();
    assert(paged.transcriptRecords <= AGENT_LIMITS.pageRecords);
    checkpoints.push({ stage, firstCursor: fullFirstPage.page.nextCursor, nextCursor: paged.cursor,
      lastRecord: fullFirstPage.run.transcript.lastRecord, displayedRecords: paged.transcriptRecords,
      truncationMeansDataLossNotMorePages: true });
    await evaluate({ action: "remember" });
    await click(`Select run: ${FIRST_TASK}`);
    await ui("first historical run selected", (value) => value.state === "completed");
    await continuity("history selection does not retarget protobuf source");
    await screenshot("05-terminal-history-source-retained");
    await click("Reveal launch focus");
    await ui("deliberate Reveal retargets source", (value) => value.source === IMPLEMENTATION && value.editor);
    await evaluate({ action: "remember" });
    await click(`Select run: ${SECOND_TASK}`);
    await ui("second active run selected", (value) => value.state === "running");
    await continuity("active run selection does not retarget implementation source");
    stage = "real core crash with pending steering";
    await evaluate({ action: "text", field: "instruction", value: "FIXTURE: pending at actual core death; never replay this instruction." });
    await click("Send to this run");
    await until("durable crash-boundary intent", () => read(second), (value) => receipt(value.run, 0, "pending"));
    const beforeCrash = await until("adapter received crash-boundary steer", diagnostics, (value) => value.totals.steer === 3);
    assert.equal(beforeCrash.totals.start, 2); assert.equal(beforeCrash.totals.interrupt, 1);
    const beforeLedger = await evaluate<Ledger>({ action: "ledger" });
    const generation = Math.max(...beforeLedger.lifecycle.map((entry) => entry.generation));
    options.crashCore();
    await until("supervisor replacement ready", () => evaluate<Ledger>({ action: "ledger" }),
      (value) => value.lifecycle.some((entry) => entry.generation > generation && entry.phase === "ready"));
    const recovered = await until("durable unknown recovery", () => read(second), (value) => value.run.state === "unknown" && receipt(value.run, 0, "delivery-unknown"));
    assert.equal(recovered.run.cleanup.status, "unknown"); assert.equal(recovered.run.processState, "unknown");
    assert.equal(recovered.run.transcript.tailMayBeLost, true);
    const recoveredSnapshot: AgentSnapshot = await snapshot();
    assert.equal(recoveredSnapshot.runs.length, 2);
    assert.equal(recoveredSnapshot.capabilities.controls.launch, false);
    assert.equal(recoveredSnapshot.capabilities.reason?.code, "AGENT_OUTCOME_UNKNOWN");
    assert.equal((await read(first)).run.state, "completed", "terminal history survives actual core loss");
    await ui("unknown recovery UI", (value) => value.state === "unknown" && value.receipts.includes("Instruction · delivery-unknown") && value.evidence.includes("cleanup: unknown"));
    await continuity("actual core replacement retains source/editor/graphs/cameras");
    await screenshot("06-core-recovery-unknown-no-replay");
    await click("Ask an agent about this focus");
    await evaluate({ action: "text", field: "task", value: "FIXTURE: inspect recovery gate without launching a third run." });
    await click("Prepare disk context");
    // R2 blocks preparation as well as launch when old cleanup is unknown.
    // A nonexistent launch button is honest unavailable UI, not a fake draft.
    await ui("recovery refuses preparation", (value) => value.notice.includes("AGENT_OUTCOME_UNKNOWN") &&
      value.buttons.some((button) => button.label === "Prepare disk context" && !button.disabled) && !value.context);
    assert(!(await observe()).buttons.some((button) => button.label === "Launch read-only run" && !button.disabled));
    await screenshot("07-recovery-blocks-unsafe-new-launch");
    const afterCrash = await diagnostics();
    assert.deepEqual(afterCrash.totals, { start: 0, steer: 0, interrupt: 0, dispose: 0 }, "replacement core must not replay old mutations");
    const ledger = await evaluate<Ledger>({ action: "ledger" });
    assert.equal(ledger.overflow, false);
    assert(ledger.events.every((entry) => entry.tailRecords <= AGENT_LIMITS.tailRecords));
    const observedStates = new Set(ledger.events.flatMap((entry) => entry.runs.map((run) => run.state)));
    for (const state of ["starting", "running", "cancelling", "completed", "unknown"]) assert(observedStates.has(state), `actual subscription observed ${state}`);
    return { fixture: "TEST-ONLY E2 adapter / actual R2 service, disk store and W2 preload UI", liveProviderRequests: 0,
      externalProcesses: 0, processOwnershipProof: "Not exercised by this in-process fixture; existing namespace owner tests are separate.",
      elapsedMs: Date.now() - started, runIds: { completed: first, unknown: second }, checkpoints,
      diagnostics: { beforeCrash, replacementCore: afterCrash }, lifecycle: ledger,
      restartDistinction: "This journey uses actual crash replacement, not intentional restart grace; the latter remains separately tested at 1000ms.",
      queue: "No automatic task queue exists; starting is durable admission, not provider work.",
      productionPolicy: "ADAPTER_POLICY_UNAVAILABLE unchanged; fixture profile is not effective live-provider policy.",
      finalState: { completed: completed.run.state, recovered: recovered.run.state, steering: recovered.run.instructions[0]!.status,
        cleanup: recovered.run.cleanup.status, newLaunchDisabled: true, noReplay: true } };
  } catch (error) {
    const diagnostic: Record<string, unknown> = { stage, elapsedMs: Date.now() - started,
      message: error instanceof Error ? error.message.slice(0, 2000) : "Journey failed", checkpoints };
    try {
      const { context, ...observed } = await observe();
      diagnostic.ui = { ...observed, preparedContextVisible: Boolean(context) };
    } catch { diagnostic.ui = "owned renderer unavailable"; }
    try { diagnostic.lifecycle = await evaluate<Ledger>({ action: "ledger" }); } catch { diagnostic.lifecycle = "observer unavailable"; }
    try { diagnostic.adapter = await diagnostics(); } catch { diagnostic.adapter = "owned core unavailable"; }
    await writeFile(join(artifactDirectory, "journey-failure.json"), JSON.stringify(diagnostic, null, 2), { mode: 0o600 });
    try { await screenshot("journey-failure"); } catch { /* Caller still cleans owned resources. */ }
    throw error;
  } finally {
    try { await evaluate({ action: "remove-observer" }); } catch { /* The caller may already have closed the owned window. */ }
  }
}
