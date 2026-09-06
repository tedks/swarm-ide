/** TEST ONLY: ordinary UI input drives the human-paced rehearsal.
 * Snapshot/read calls below are assertions, never fixture settlement controls.
 * The caller alone owns virtual-desktop validation and window/core cleanup.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { AGENT_LIMITS, type AgentResult } from "../../protocol/agents";
import { PROTOCOL_VERSION, type CoreResponse } from "../../protocol/schema";

const SOURCE = "examples/checkout-world/services/fraudcheck/fraudcheck.ts";
const CONTRACT = "examples/checkout-world/services/fraudcheck/fraudcheck.proto";
const LITERAL = "<img src=x onerror=alert('rehearsal')>";
const FIRST_TASK = `REHEARSAL: réponse 🧪 ${LITERAL}`;
const SECOND_TASK = "REHEARSAL: inspect bounded historical output.";
const THIRD_TASK = "REHEARSAL: delayed instruction and Stop uncertainty.";
const CLOSE_TASK = "REHEARSAL: close while deterministic output is active.";

export type RehearsalLedger = {
  requests: { type: string; requestId: string }[];
  events: { runId: string; state: string; processState: string; cleanup: string }[];
  generations: number;
  overflow: boolean;
};
type Action =
  | { action: "observe" | "remember" | "continuity" | "palette" | "confirm" | "editor-focus" | "remove-click-observer" }
  | { action: "click" | "focus-button"; label: string }
  | { action: "click-observed" | "button-focused"; token: string }
  | { action: "expand-reload-guard" }
  | { action: "text"; field: "task" | "instruction"; value: string }
  | { action: "path"; value: string }
  | { action: "pan-point"; index: number }
  | { action: "read"; version: typeof PROTOCOL_VERSION; runId?: string; afterRecord?: number };
type Observation = {
  source: string | null; editor: boolean; graphs: number; cameras: string[]; state: string | null;
  draftFocus: string | null; context: string; receipts: string[]; evidence: string; notice: string;
  transcriptRecords: number; transcriptBytes: number; literalHtml: boolean; multibyte: boolean;
  injectedElements: number; cursor: number | null; banner: string; dirty: boolean; guarded: boolean; userActivated: boolean;
  dimensions: { width: number; height: number; scrollWidth: number; editorHeight: number };
  buttons: { label: string; disabled: boolean }[];
};

// Compiled then serialized as one closed function; accepts fixed UI gestures
// and read-only protocol operations, never arbitrary JS or mutation requests.
async function rendererAction(input: Action): Promise<unknown> {
  type Memory = { graphs: Element[]; editor: Element | null; cameras: string[]; source: string | null; text: string };
  type ClickObservation = { token: string; button: HTMLButtonElement; observed: boolean; off: () => void };
  const target = window as Window & { __rehearsalProofMemory?: Memory; __rehearsalClickObservation?: ClickObservation };
  const source = () => document.querySelector(".source-surface > header strong")?.textContent ?? null;
  const graphs = () => [...document.querySelectorAll(".react-flow")];
  const cameras = () => [...document.querySelectorAll<HTMLElement>(".react-flow__viewport")].map((node) => node.style.transform);
  const buttons = () => [...document.querySelectorAll<HTMLButtonElement>("button")];
  if (input.action === "button-focused") {
    const saved = target.__rehearsalClickObservation;
    return Boolean(saved?.token === input.token && document.hasFocus() && document.activeElement === saved.button);
  }
  if (input.action === "remove-click-observer") {
    target.__rehearsalClickObservation?.off(); delete target.__rehearsalClickObservation; return true;
  }
  if (input.action === "click-observed") {
    const saved = target.__rehearsalClickObservation;
    if (!saved || saved.token !== input.token) throw new Error("Expected matching trusted activation observation");
    if (!saved.observed) return false;
    saved.off(); delete target.__rehearsalClickObservation; return true;
  }
  if (input.action === "remember") {
    target.__rehearsalProofMemory = { graphs: graphs(), editor: document.querySelector(".cm-editor"), cameras: cameras(),
      source: source(), text: document.querySelector(".cm-content")?.textContent ?? "" };
    return true;
  }
  if (input.action === "continuity") {
    const previous = target.__rehearsalProofMemory;
    if (!previous) throw new Error("Rehearsal continuity baseline missing");
    const current = graphs();
    return { graphs: current.length === previous.graphs.length && current.every((node, index) => node === previous.graphs[index]),
      cameras: JSON.stringify(cameras()) === JSON.stringify(previous.cameras), source: source() === previous.source,
      editor: document.querySelector(".cm-editor") === previous.editor,
      sourceText: document.querySelector(".cm-content")?.textContent === previous.text };
  }
  if (input.action === "read") {
    if (!window.swarm) throw new Error("Actual preload bridge missing");
    const common = { protocolVersion: input.version, requestId: `rehearsal-observer:${crypto.randomUUID()}` };
    return window.swarm.request(input.runId ? { ...common, type: "agent.read", runId: input.runId, afterRecord: input.afterRecord ?? 0 }
      : { ...common, type: "agent.snapshot" });
  }
  if (input.action === "palette") {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })); return true;
  }
  if (input.action === "click" || input.action === "focus-button") {
    // The directory form has its own Open path button; only this palette
    // gesture is scoped, leaving ordinary trusted run-control inputs intact.
    const scope = input.action === "click" && input.label === "Open path"
      ? [...document.querySelectorAll<HTMLButtonElement>(".command-results button")] : buttons();
    const candidates = scope.filter((button) => button.getAttribute("aria-label") === input.label || button.textContent?.trim() === input.label ||
      (button.closest(".command-results") && button.querySelector("span")?.firstChild?.textContent === input.label));
    if (candidates.length !== 1 || candidates[0]!.disabled) throw new Error(`Expected one enabled UI control: ${input.label}`);
    const button = candidates[0]!;
    // The palette helper keeps its fixed DOM selection, but ordinary run
    // controls are activated by real Electron keyboard events in the caller.
    // DOM .click() does not grant document user activation after a reload;
    // without it Chromium may suppress a legitimate beforeunload veto.
    if (input.action === "click") { button.click(); return true; }
    button.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const rect = button.getBoundingClientRect();
    for (const fy of [0.5, 0.25, 0.75]) for (const fx of [0.5, 0.25, 0.75]) {
      const x = Math.round(rect.left + rect.width * fx); const y = Math.round(rect.top + rect.height * fy);
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit && button.contains(hit)) {
        if (target.__rehearsalClickObservation) throw new Error("Previous trusted activation observation still pending");
        const token = crypto.randomUUID();
        const saved: ClickObservation = { token, button, observed: false, off: () => document.removeEventListener("click", receive, true) };
        function receive(event: MouseEvent) {
          if (event.isTrusted && event.target instanceof Node && button.contains(event.target)) {
            saved.observed = true; saved.off();
          }
        }
        target.__rehearsalClickObservation = saved;
        document.addEventListener("click", receive, true);
        button.focus();
        return { token };
      }
    }
    throw new Error(`UI control has no visible unobstructed pointer target: ${input.label}`);
  }
  if (input.action === "expand-reload-guard") {
    const details = document.querySelector<HTMLDetailsElement>(".agent-reload-guard > details");
    const summary = details?.querySelector<HTMLElement>(":scope > summary");
    if (!details || !summary) throw new Error("Actual reload protection details missing");
    if (!details.open) summary.click(); return true;
  }
  if (input.action === "text") {
    const field = document.querySelector<HTMLTextAreaElement>(input.field === "task" ? ".agent-draft textarea" : "textarea[aria-label='Instruction to this run']");
    if (!field) throw new Error("Expected actual rehearsal textarea");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, input.value);
    field.dispatchEvent(new Event("input", { bubbles: true })); return true;
  }
  if (input.action === "path") {
    const field = document.querySelector<HTMLInputElement>("input[aria-label='Exact repository path']");
    if (!field) throw new Error("Expected exact repository path mode");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, input.value);
    field.dispatchEvent(new Event("input", { bubbles: true })); return true;
  }
  if (input.action === "confirm") {
    const field = document.querySelector<HTMLInputElement>(".agent-confirm input[type=checkbox]");
    if (!field || field.checked) throw new Error("Expected unconfirmed context inspection");
    field.click(); return true;
  }
  if (input.action === "editor-focus") {
    const field = document.querySelector<HTMLElement>(".cm-content");
    if (!field) throw new Error("Actual editor missing"); field.focus(); return true;
  }
  if (input.action === "pan-point") {
    const flow = graphs()[input.index];
    if (!flow) throw new Error("Expected graph to pan");
    const rect = flow.getBoundingClientRect();
    // Pick a genuinely blank pane point, not a node, edge, or toolbar.
    for (const fy of [0.2, 0.4, 0.6, 0.8]) for (const fx of [0.2, 0.35, 0.5, 0.65]) {
      const x = Math.round(rect.left + rect.width * fx); const y = Math.round(rect.top + rect.height * fy);
      if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane") && x + 35 < rect.right && y + 20 < rect.bottom)
        return { x, y };
    }
    throw new Error("No visible blank graph pane point for ordinary pointer pan");
  }
  const transcript = document.querySelector("[aria-label='Agent transcript']");
  const text = transcript?.textContent ?? "";
  const cursor = document.querySelector(".agent-pagination small")?.textContent?.match(/cursor (\d+)/);
  return {
    source: source(), editor: Boolean(document.querySelector(".cm-editor")), graphs: graphs().length, cameras: cameras(),
    state: document.querySelector(".agent-pane-header .agent-state")?.textContent ?? null,
    draftFocus: document.querySelector(".agent-draft > .agent-context-path")?.textContent ?? null,
    context: document.querySelector(".agent-draft .agent-launch-context")?.textContent?.slice(0, 16_384) ?? "",
    receipts: [...document.querySelectorAll(".agent-receipts summary")].map((node) => node.textContent ?? ""),
    evidence: document.querySelector(".agent-output > .agent-evidence")?.textContent?.slice(0, 4096) ?? "",
    notice: document.querySelector(".agent-rail [role=status]")?.textContent?.slice(0, 2000) ?? "",
    transcriptRecords: transcript?.querySelectorAll(".agent-record").length ?? 0,
    transcriptBytes: new TextEncoder().encode(text).byteLength,
    literalHtml: text.includes("<img src=x onerror=alert('rehearsal')>"), multibyte: text.includes("réponse 🧪"),
    injectedElements: transcript?.querySelectorAll("img,script,iframe,svg").length ?? 0, cursor: cursor ? Number(cursor[1]) : null,
    banner: document.getElementById("test-only-rehearsal-label")?.textContent ?? "",
    dirty: Boolean(document.querySelector(".source-surface .file-dirty")),
    guarded: document.querySelector("[aria-label='Local agent reload protection'] > strong")?.textContent === "Agent intent protects this document",
    userActivated: navigator.userActivation.hasBeenActive,
    dimensions: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      editorHeight: document.querySelector(".cm-editor")?.getBoundingClientRect().height ?? 0 },
    buttons: buttons().map((button) => ({ label: button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "", disabled: button.disabled })),
  } satisfies Observation;
}

export async function runRehearsalProof(options: {
  window: BrowserWindow; artifactDirectory: string; ledger: () => RehearsalLedger;
}): Promise<Record<string, unknown>> {
  const { window: ownedWindow, artifactDirectory, ledger } = options;
  const checkpoints: Record<string, unknown>[] = [];
  const started = Date.now();
  let stage = "opening source";
  let loads = 0; let prevented = 0;
  const loaded = () => { loads += 1; }; const vetoed = () => { prevented += 1; };
  ownedWindow.webContents.on("did-finish-load", loaded);
  ownedWindow.webContents.on("will-prevent-unload", vetoed);
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  const evaluate = <T>(input: Action) => ownedWindow.webContents.executeJavaScript(`(${rendererAction.toString()})(${JSON.stringify(input)})`) as Promise<T>;
  const observe = () => evaluate<Observation>({ action: "observe" });
  const until = async <T>(label: string, read: () => Promise<T>, accepts: (value: T) => boolean, milliseconds = 10_000): Promise<T> => {
    const deadline = Date.now() + milliseconds;
    do {
      const value = await read(); if (accepts(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 35));
    } while (Date.now() < deadline);
    throw new Error(`Rehearsal timeout: ${label} (stage ${stage})`);
  };
  const ui = (label: string, accepts: (value: Observation) => boolean) => until(label, observe, accepts);
  const click = async (label: string) => {
    await ui(`enabled ${label}`, (value) => value.buttons.some((button) => button.label === label && !button.disabled));
    // Native activation may restore the previously focused renderer element.
    // Finish it BEFORE selecting the button, then attest exact DOM focus before
    // sending the single gesture. Never retry an action with unknown delivery.
    ownedWindow.focus(); ownedWindow.webContents.focus();
    await until("owned window focused", async () => ownedWindow.isFocused() && ownedWindow.webContents.isFocused(), Boolean);
    const { token } = await evaluate<{ token: string }>({ action: "focus-button", label });
    await until(`exact button focused: ${label}`, () => evaluate<boolean>({ action: "button-focused", token }), Boolean);
    // Activate the actual focused button with a native keyboard gesture. This
    // avoids mixing CSS coordinates with native/DPI-scaled input coordinates.
    ownedWindow.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    ownedWindow.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
    ownedWindow.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await until(`trusted keyboard activation delivered: ${label}`, () => evaluate<boolean>({ action: "click-observed", token }), Boolean);
  };
  const snapshot = async () => {
    const result = await evaluate<CoreResponse>({ action: "read", version: PROTOCOL_VERSION });
    assert(result.ok && result.agent?.kind === "snapshot", "actual bridge snapshot"); return result.agent.snapshot;
  };
  const read = async (runId: string) => {
    const result = await evaluate<CoreResponse>({ action: "read", version: PROTOCOL_VERSION, runId });
    assert(result.ok && result.agent?.kind === "read", "actual durable history read");
    return result.agent as Extract<AgentResult, { kind: "read" }>;
  };
  const screenshot = async (name: string) => {
    const captured = await ownedWindow.webContents.capturePage(); assert(!captured.isEmpty());
    await writeFile(join(artifactDirectory, `${name}.png`), captured.toPNG(), { mode: 0o600 });
  };
  const continuity = async (label: string) => {
    const value = await evaluate<Record<string, boolean>>({ action: "continuity" });
    assert(Object.values(value).every(Boolean), `${label}: ${JSON.stringify(value)}`);
    checkpoints.push({ stage: label, ...value });
  };
  const open = async (path: string) => {
    await evaluate({ action: "palette" });
    await until("palette item", async () => {
      try { return await evaluate<boolean>({ action: "click", label: "Open repository path" }); } catch { return false; }
    }, Boolean);
    await until("exact repository path mode", async () => {
      try { return await evaluate<boolean>({ action: "path", value: path }); } catch { return false; }
    }, Boolean);
    await until("open exact path", async () => {
      try { return await evaluate<boolean>({ action: "click", label: "Open path" }); } catch { return false; }
    }, Boolean);
    await ui("source ready", (value) => value.source === path && value.editor);
  };
  const prepare = async (text: string) => {
    await evaluate({ action: "text", field: "task", value: text }); await click("Prepare disk context");
    await ui("inspectable disk context", (value) => value.context.includes("Context hash:") && value.context.includes("not a frozen filesystem"));
    const inspection = await observe(); assert(inspection.context.includes("Instruction source observations"));
    assert(inspection.context.includes("Configuration source observations"));
    await evaluate({ action: "confirm" });
  };
  const launch = async (text: string, count: number) => {
    const source = (await observe()).source;
    await click("Ask an agent about this focus");
    await ui("draft created before preparation", (value) => value.draftFocus !== null && value.draftFocus === source);
    await prepare(text); await click("Launch read-only run");
    const admitted = await until("one explicit durable admission", snapshot, (value) => value.runs.length === count && value.activeRunId !== null);
    const id = admitted.activeRunId!;
    await until("actual run is running", () => read(id), (value) => value.run.state === "running");
    return id;
  };
  const keys = (keyCode: string, modifiers: ("control" | "shift")[] = []) => {
    ownedWindow.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    ownedWindow.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  };
  const mutations = () => ledger().requests.filter((entry) => ["agent.launch", "agent.steer", "agent.cancel"].includes(entry.type));
  try {
    await ui("both graphs and rehearsal label", (value) => value.graphs === 2 && value.banner.includes("REHEARSAL") && value.banner.includes("no model or external agent process"));
    await open(SOURCE);
    assert.equal((await snapshot()).runs.length, 0, "fresh isolated rehearsal history");
    await new Promise((resolve) => setTimeout(resolve, 250));
    const initial = await observe();
    for (let index = 0; index < 2; index += 1) {
      const { x, y } = await evaluate<{ x: number; y: number }>({ action: "pan-point", index });
      ownedWindow.webContents.sendInputEvent({ type: "mouseMove", x, y });
      ownedWindow.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, x, y });
      ownedWindow.webContents.sendInputEvent({ type: "mouseMove", x: x + 35, y: y + 20 });
      ownedWindow.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, x: x + 35, y: y + 20 });
      await ui("actual graph camera panned", (value) => value.cameras[index] !== initial.cameras[index]);
    }
    checkpoints.push({ stage: "ordinary pointer panned both graphs", initial: initial.cameras, panned: (await observe()).cameras });
    stage = "fixed focus and actual prepared disk context";
    await click("Ask an agent about this focus");
    await ui("source draft created before navigation", (value) => value.draftFocus === SOURCE);
    await open(CONTRACT);
    await ui("draft focus retained", (value) => value.draftFocus === SOURCE && value.source === CONTRACT);
    await prepare(FIRST_TASK); await screenshot("01-prepared-disk-context");
    await click("Launch read-only run");
    const admission = await until("first admission", snapshot, (value) => value.runs.length === 1 && value.activeRunId !== null);
    const first = admission.activeRunId!;
    await ui("literal multibyte paced stream", (value) => value.state === "running" && value.literalHtml && value.multibyte);
    assert.equal((await observe()).injectedElements, 0, "synthetic HTML is literal text");
    const submitted = (await read(first)).run.launchContext;
    assert.equal(submitted.root, process.cwd(), "actual registered workspace supplies context");
    assert.equal(submitted.focus.path, SOURCE, "navigation did not retarget the prepared focus");
    assert.equal(submitted.taskText, FIRST_TASK);
    assert.equal(submitted.diskOnly, true);
    assert.equal(submitted.attachments.length, 1);
    assert.equal(submitted.attachments[0]?.path, SOURCE);
    assert.equal(submitted.attachments[0]?.content, await readFile(join(process.cwd(), SOURCE), "utf8"), "context attachment is actual source disk bytes");
    checkpoints.push({ stage, contextHash: submitted.contextHash, workingFingerprint: submitted.workingFingerprint,
      diskOnly: submitted.diskOnly, attachmentPath: SOURCE, attachmentDigest: submitted.attachments[0]?.digest, actualDiskBytesMatched: true });
    await evaluate({ action: "remember" });
    await screenshot("02-human-paced-output");
    await evaluate({ action: "text", field: "instruction", value: "REHEARSAL: accepted réponse 🧪" });
    await click("Send to this run");
    await until("real pending instruction receipt", () => read(first), (value) => value.run.instructions[0]?.status === "pending");
    await until("real accepted instruction receipt", () => read(first), (value) => value.run.instructions[0]?.status === "accepted");
    await ui("accepted instruction visible", (value) => value.receipts.includes("Instruction · accepted"));
    // Sending deliberately retains text; clear only this known accepted field
    // through its normal input before the later reload test.
    await evaluate({ action: "text", field: "instruction", value: "" });
    await continuity("accepted steering retains source and both cameras");
    await click("Stop");
    await ui("Stop acknowledgement is not terminal", (value) => value.state === "cancelling" && value.receipts.includes("Stop · accepted"));
    const stopped = await until("terminal plus in-process disposal", () => read(first), (value) => value.run.state === "cancelled" && value.run.cleanup.status === "confirmed");
    assert.equal(stopped.run.providerOutcome.kind, "turn"); assert.equal(stopped.run.processState, "exited");
    assert.equal(stopped.run.exitCode, null); assert.match(stopped.run.cleanup.detail, /in-process|rehearsal/i);
    checkpoints.push({ stage: "ordinary Stop", runId: first, state: stopped.run.state, cleanup: stopped.run.cleanup, externalProcessProof: false });
    stage = "paged completed history";
    const second = await launch(SECOND_TASK, 2);
    const complete = await until("autonomous bounded transcript completes", () => read(second), (value) => value.run.state === "completed" && value.run.cleanup.status === "confirmed", 30_000);
    assert(complete.run.transcript.bytes > AGENT_LIMITS.pageBytes, "actual retained history exceeds one page");
    assert(complete.page.nextCursor < complete.run.transcript.lastRecord, "history genuinely requires another page");
    await click("Read transcript from start");
    await ui("first bounded history page", (value) => value.cursor === complete.page.nextCursor);
    await click("Read next transcript page");
    const paged = await ui("next bounded history page", (value) => value.cursor !== null && value.cursor > complete.page.nextCursor);
    assert(paged.transcriptRecords <= AGENT_LIMITS.pageRecords);
    checkpoints.push({ stage, bytes: complete.run.transcript.bytes, firstCursor: complete.page.nextCursor, nextCursor: paged.cursor, displayedRecords: paged.transcriptRecords });
    await evaluate({ action: "remember" }); await click(`Select run: ${FIRST_TASK}`);
    await ui("earlier run selected", (value) => value.state === "cancelled");
    await continuity("history selection does not retarget source or cameras");
    await screenshot("03-history-source-retained");
    await click("Reveal launch focus"); await ui("explicit Reveal changes source", (value) => value.source === SOURCE);
    stage = "dirty work veto then clean renderer reload";
    await evaluate({ action: "remember" });
    await evaluate({ action: "editor-focus" }); keys("Home", ["control"]);
    const marker = "REHEARSAL_UNSAVED ";
    await ownedWindow.webContents.insertText(marker);
    await ui("actual editor buffer dirty", (value) => value.dirty);
    const beforeVeto = prevented; const beforeLoads = loads; const beforeMutations = mutations();
    ownedWindow.webContents.reload();
    await until("dirty buffer prevents reload", async () => prevented, (value) => value > beforeVeto);
    assert.equal(loads, beforeLoads); assert((await observe()).dirty);
    await screenshot("04-unsaved-buffer-reload-veto");
    await evaluate({ action: "editor-focus" }); keys("Home", ["control"]);
    for (let index = 0; index < marker.length; index += 1) keys("Right", ["shift"]);
    keys("Backspace");
    await ui("only inserted probe removed by normal keys", (value) => !value.dirty);
    await continuity("dirty reload veto preserved actual source buffer");
    assert(!(await observe()).guarded, "no unresolved local intent discarded for reload");
    ownedWindow.webContents.reload();
    await until("clean document reload", async () => loads, (value) => value > beforeLoads);
    await ui("reloaded source and persistent rehearsal label", (value) => value.source === SOURCE && value.editor && value.banner.includes("no model or external agent process"));
    const reloaded = await until("history rehydrated without replay", snapshot, (value) => value.runs.length === 2);
    assert.deepEqual(mutations(), beforeMutations, "document reload emits no new launch/steer/cancel");
    assert.equal(reloaded.activeRunId, null);
    checkpoints.push({ stage, vetoObserved: true, cleanReloadObserved: true, savedSourceWrites: ledger().requests.filter((entry) => entry.type === "file.write").length,
      durableHistory: reloaded.runs.length, replayedMutations: 0 });
    await screenshot("05-reloaded-label-and-history");
    stage = "delayed steering races real Stop";
    const third = await launch(THIRD_TASK, 3);
    await evaluate({ action: "text", field: "instruction", value: "[delay] REHEARSAL: this late acknowledgement must not be replayed." });
    await click("Send to this run");
    await until("delayed intent durably pending", () => read(third), (value) => value.run.instructions[0]?.status === "pending");
    await click("Stop");
    await ui("racing Stop acknowledged before terminal", (value) => value.state === "cancelling" && value.receipts.includes("Stop · accepted"));
    const raced = await until("terminal disposal retains delivery uncertainty", () => read(third), (value) => value.run.state === "cancelled" &&
      value.run.cleanup.status === "confirmed" && value.run.instructions[0]?.status === "delivery-unknown");
    await ui("honest unknown instruction and reload protection", (value) => value.receipts.includes("Instruction · delivery-unknown") && value.guarded);
    assert((await observe()).userActivated, "trusted keyboard input activated this reloaded document before testing its veto");
    const beforeUnknownVeto = prevented; const beforeUnknownLoads = loads; const beforeAcknowledgment = mutations();
    ownedWindow.webContents.reload();
    await until("unknown intent prevents document reload", async () => prevented, (value) => value > beforeUnknownVeto);
    assert.equal(loads, beforeUnknownLoads);
    await screenshot("06-delayed-steer-stop-unknown-guard");
    // This is an explicit human-facing loss acknowledgment, not receipt
    // reconciliation, fixture reset, forced refresh, or proof of delivery.
    await evaluate({ action: "expand-reload-guard" });
    await click("Discard local agent intent and allow refresh");
    await ui("explicit local-loss decision releases only local guard", (value) => !value.guarded);
    assert.deepEqual((await read(third)).run.instructions[0], raced.run.instructions[0], "loss acknowledgment never changes durable unknown receipt");
    assert.deepEqual(mutations(), beforeAcknowledgment, "explicit local-loss acknowledgment does not resend commands");
    ownedWindow.webContents.reload();
    await until("explicitly acknowledged document refresh", async () => loads, (value) => value > beforeUnknownLoads);
    await ui("label and source after acknowledged refresh", (value) => value.source === SOURCE && value.editor && value.banner.includes("no model or external agent process"));
    await until("all three histories survive acknowledged refresh", snapshot, (value) => value.runs.length === 3);
    assert.deepEqual((await read(third)).run.instructions[0], raced.run.instructions[0]);
    assert.deepEqual(mutations(), beforeAcknowledgment, "no replay after acknowledged refresh");
    checkpoints.push({ stage, state: raced.run.state, cleanup: raced.run.cleanup.status, instruction: raced.run.instructions[0]?.status,
      reloadVetoObserved: true, explicitAction: "Discard local agent intent and allow refresh", acknowledgedLocalReceiptLossOnly: true,
      durableReceiptUnchanged: true, replayedMutations: 0, trustedKeyboardActivationBeforeVeto: true });
    stage = "ordinary window close during active output";
    const fourth = await launch(CLOSE_TASK, 4);
    await ui("fourth active output before caller closes owned window", (value) => value.state === "running" && value.transcriptRecords > 0 && !value.guarded);
    const active = await read(fourth);
    assert.equal(active.run.processState, "live"); assert.equal(active.run.cleanup.status, "pending");
    await screenshot("07-active-output-before-ordinary-close");
    const finalLedger = ledger();
    assert.equal(finalLedger.overflow, false, "request and lifecycle ledger remained bounded and complete");
    assert.equal(finalLedger.requests.filter((entry) => entry.type === "agent.launch").length, 4);
    assert.equal(finalLedger.requests.filter((entry) => entry.type === "agent.steer").length, 2);
    assert.equal(finalLedger.requests.filter((entry) => entry.type === "agent.cancel").length, 2);
    assert.equal(finalLedger.requests.filter((entry) => entry.type === "file.write").length, 0, "proof never writes source");
    const observedFirst = finalLedger.events.filter((entry) => entry.runId === first);
    for (const state of ["starting", "running", "cancelling", "cancelled"])
      assert(observedFirst.some((entry) => entry.state === state), `actual service event observed ${state}`);
    assert(observedFirst.some((entry) => entry.state === "cancelled" && entry.cleanup === "pending"), "terminal observation is separate from cleanup");
    assert(observedFirst.some((entry) => entry.state === "cancelled" && entry.cleanup === "confirmed"), "actual in-process cleanup later confirmed");
    return { fixtureOnly: true, externalAgentProcesses: 0, liveProviderRequests: 0, elapsedMs: Date.now() - started,
      checkpoints, runIds: { first, second, third, activeAtClose: fourth }, lifecycle: finalLedger, dimensions: (await observe()).dimensions,
      beforeOrdinaryClose: { runId: fourth, state: active.run.state, processState: active.run.processState, cleanup: active.run.cleanup.status },
      closeProof: "Caller must close this actual window normally and separately verify graceful core/store/timer cleanup; this return does not claim it.",
      processOwnershipProof: "No external agent process exists; in-process disposal is not namespace or effective-policy proof.",
      productionPolicy: "ADAPTER_POLICY_UNAVAILABLE unchanged; no installed Codex, model request, or inference exercised." };
  } catch (error) {
    const failure: Record<string, unknown> = { stage, elapsedMs: Date.now() - started,
      message: error instanceof Error ? error.message.slice(0, 2000) : "Rehearsal proof failed", checkpoints, lifecycle: ledger() };
    try { const { context, ...value } = await observe(); failure.ui = { ...value, preparedContextVisible: Boolean(context) }; } catch { failure.ui = "renderer unavailable"; }
    await writeFile(join(artifactDirectory, "rehearsal-failure.json"), JSON.stringify(failure, null, 2), { mode: 0o600 });
    try { await screenshot("rehearsal-failure"); } catch { /* Caller still owns failure cleanup. */ }
    throw error;
  } finally {
    try { await evaluate({ action: "remove-click-observer" }); } catch { /* Destroyed documents own no surviving DOM listeners. */ }
    ownedWindow.webContents.removeListener("did-finish-load", loaded);
    ownedWindow.webContents.removeListener("will-prevent-unload", vetoed);
  }
}
