/** TEST ONLY: ordinary user gestures and read-only transport/store evidence.
 * No metadata injection, mutation request shortcuts, or model exists here. */
import assert from "node:assert/strict";
import { app, type BrowserWindow } from "electron";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { advanceUnrelatedTaskFixture, resumeTaskFixture } from "../../tools/task-integration/fixture.mjs";
import { AdmissionReceiptSchema, AgentResultSchema, RunSchema, TranscriptRecordSchema, type Run, type TranscriptRecord } from "../../protocol/agents";
import { PROTOCOL_VERSION } from "../../protocol/schema";
import type { RehearsalLedger } from "./agent-rehearsal-driver";
import { assessTaskRendererErrors, finishTaskDiagnostics, installTaskResizeDiagnostics } from "./task-rehearsal-diagnostics";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` :
  value !== null && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}` : JSON.stringify(value);
export type TaskRehearsalProof = { run: Run; transcriptHash: string; originalMetadata: string; currentMetadata: string; rendererErrors: string[];
  sourceUnchanged: true; replayedCommands: 0; fixtureOnly: true; coreGenerations: number; elapsedMs: number };

/** Exact bounded read-only history observation, independently repeated at each recovery boundary. */
export async function readTaskRehearsalTranscript(run: Run, readPage: (afterRecord: number) => Promise<unknown>) {
  assert(run.state === "completed" && run.cleanup.status === "confirmed");
  assert(run.transcript.lastRecord > 0 && run.transcript.lastRecord <= 81 && !run.transcript.truncated && !run.transcript.tailMayBeLost);
  const records: TranscriptRecord[] = [];
  while (records.length < run.transcript.lastRecord) {
    const result = AgentResultSchema.parse(await readPage(records.length));
    assert(result.kind === "read"); assert.deepEqual(result.run, run);
    assert(!result.page.truncated && result.page.records.length > 0);
    for (const record of result.page.records) {
      assert.equal(record.recordId, records.length + 1);
      records.push(record);
      assert(records.length <= run.transcript.lastRecord);
    }
    assert.equal(result.page.nextCursor, records.length);
  }
  assert.equal(Buffer.byteLength(JSON.stringify(records)), run.transcript.bytes);
  return { records, transcriptHash: hash(JSON.stringify(records)) };
}

export async function runTaskRehearsalProof({ window: win, artifacts, ledger }: {
  window: BrowserWindow; artifacts: string; ledger(): RehearsalLedger;
}): Promise<TaskRehearsalProof> {
  const started = Date.now(), wc = win.webContents;
  const fixture = await resumeTaskFixture(JSON.parse(await readFile(join(artifacts, "fixture.json"), "utf8")), process.env.SWARM_TASK_REHEARSAL_SCRATCH!);
  assert.equal(fixture.root, process.cwd());
  const errors: string[] = [];
  let phase = "initialization";
  const consoleEvidence: unknown[] = [];
  const documentEvidence: unknown[] = [];
  wc.on("console-message", (event) => { if (event.level === "error") {
    errors.push(event.message.slice(0, 4096));
    if (consoleEvidence.length < 16) consoleEvidence.push({ at: Date.now(), phase, zoom: wc.getZoomFactor(),
      message: event.message.slice(0, 4096), line: event.lineNumber, source: event.sourceId });
  } });
  const js = <T = unknown>(code: string) => wc.executeJavaScript(code, true) as Promise<T>;
  const installDiagnostics = () => js(`globalThis.__taskResize?.dispose();globalThis.__taskResize=(${installTaskResizeDiagnostics.toString()})();void 0`);
  let installed = installDiagnostics();
  const reinstallDiagnostics = () => { installed = installDiagnostics(); };
  wc.on("did-finish-load", reinstallDiagnostics);
  const q = JSON.stringify;
  const until = async <T>(label: string, read: () => Promise<T>, accept: (value: T) => boolean, ms = 15000): Promise<T> => {
    phase = label;
    const end = Date.now() + ms;
    do { const value = await read(); if (accept(value)) return value; await new Promise((done) => setTimeout(done, 40)); } while (Date.now() < end);
    throw new Error(`Task rehearsal timed out: ${label}`);
  };
  const has = (selector: string) => js<boolean>(`Boolean(document.querySelector(${q(selector)}))`);
  const text = (selector: string) => js<string>(`document.querySelector(${q(selector)})?.textContent ?? ''`);
  const key = (keyCode: string, modifiers: Electron.KeyboardInputEvent["modifiers"] = []) => {
    wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    if (keyCode === "Enter") wc.sendInputEvent({ type: "char", keyCode: "\r", modifiers });
    wc.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  };
  const click = async (selector: string) => {
    phase = `click ${selector}`;
    win.focus(); wc.focus();
    await until("owned focus", async () => win.isFocused() && wc.isFocused(), Boolean);
    await until(`enabled ${selector}`, () => js<boolean>(`(() => { const t=document.querySelector(${q(selector)});return Boolean(t && !t.disabled); })()`), Boolean);
    await js(`(() => { const t=document.querySelector(${q(selector)});t.scrollIntoView({block:'center'}); })()`);
    await js("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    const point = await js<{ x: number; y: number }>(`(() => {
      const t=document.querySelector(${q(selector)}), r=t.getBoundingClientRect();
      const x=r.x+r.width/2,y=r.y+r.height/2;
      if(!r.width || !r.height || !t.contains(document.elementFromPoint(x,y))) throw new Error('Control is not visibly reachable');
      globalThis.__taskClickObserve?.off();
      const saved={count:0,off:()=>t.removeEventListener('click',receive)};
      function receive(e){if(e.isTrusted) saved.count++;}
      globalThis.__taskClickObserve=saved;
      t.addEventListener('click',receive);
      return {x,y};
    })()`);
    const native = { x: Math.round(point.x * wc.getZoomFactor()), y: Math.round(point.y * wc.getZoomFactor()) };
    wc.sendInputEvent({ type: "mouseMove", ...native });
    wc.sendInputEvent({ type: "mouseDown", ...native, button: "left", clickCount: 1 });
    wc.sendInputEvent({ type: "mouseUp", ...native, button: "left", clickCount: 1 });
    await until("trusted activation delivered", () => js<number>("globalThis.__taskClickObserve.count"), (count) => count > 0);
    assert.equal(await js("globalThis.__taskClickObserve.count"), 1, "one gesture cannot create duplicate commands");
    await js("globalThis.__taskClickObserve.off();delete globalThis.__taskClickObserve");
  };
  const label = (value: string) => `[aria-label=${q(value)}]`;
  const screenshot = async (name: string) => { await js("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    await writeFile(join(artifacts, name), (await wc.capturePage()).toPNG()); };
  const taskScreenshot = async (detail: string, name: string) => {
    const selector = `${detail} > p`;
    await js(`document.querySelector(${q(selector)}).scrollIntoView({block:'start'})`);
    await js("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    assert.equal(await js<boolean>(`(() => {const t=document.querySelector(${q(selector)}),r=t.getBoundingClientRect();
      return r.width>0 && r.height>0 && r.y>=0 && r.y+8<innerHeight && t.contains(document.elementFromPoint(r.x+Math.min(20,r.width/2),r.y+8));})()`), true,
    "Recorded original-revision label must actually be visible, not merely present below a scroll fold");
    await screenshot(name);
  };
  const mutations = () => ledger().requests.filter((request) => ["agent.prepare", "agent.launch", "agent.steer", "agent.cancel", "file.write"].includes(request.type));
  const request = (input: object) => js<any>(`window.swarm.request({...${q(input)},protocolVersion:${PROTOCOL_VERSION},requestId:'task-rehearsal:'+crypto.randomUUID()})`);
  const snapshot = async () => { const result = await request({ type: "agent.snapshot" }); assert(result.ok && result.agent.kind === "snapshot"); return result.agent.snapshot; };
  const read = async (runId: string) => { const result = await request({ type: "agent.read", runId, afterRecord: 0 }); assert(result.ok && result.agent.kind === "read"); return result.agent.run as Run; };
  const transcript = (run: Run) => readTaskRehearsalTranscript(run, async (afterRecord) => {
    const result = await request({ type: "agent.read", runId: run.runId, afterRecord });
    assert(result.ok); return result.agent;
  });
  let originalFailure: { error: unknown } | null = null;
  try {
  await installed;
  await until("native owned window selected", () => readFile(join(artifacts, "window-selected"), "utf8").then(() => true, () => false), Boolean, 30000);
  await js("addEventListener('error', e=>console.error(e.error?.stack ?? e.message))");
  await until("actual CLI Tasks reader", () => has("[data-task-status='observed']"), Boolean);
  const initial = await snapshot(); assert.equal(initial.runs.length, 0); assert.equal(initial.capabilities.provider, "deterministic-rehearsal");
  await click(label(`Select task ${fixture.taskId}`));
  await click(".task-show-details");
  await until("real task detail", () => text(".task-detail .task-title"), (value) => value === fixture.title);
  await click(label(`Reveal working file ${fixture.sourcePath} at line ${fixture.sourceLine}`));
  await until("source editor", () => has(".cm-content"), Boolean);
  await until("Reveal completes its intended line handoff", () => text(".cm-activeLine"),
    (value) => value === fixture.sourceText.split("\n")[fixture.sourceLine - 1]);
  await until("Reveal finishes directory navigation before retention baseline", () => has('.graph-pane[data-directory="src"][data-observation-state="observed"]'), Boolean);
  let previousCameras = "", stableAt = Date.now();
  await until("initial directory camera settles before user cursor/baseline", async () => {
    const current = await js<string>("JSON.stringify([...document.querySelectorAll('.react-flow__viewport')].map(n=>n.style.transform))");
    if (current !== previousCameras) { previousCameras = current; stableAt = Date.now(); }
    return Date.now() - stableAt >= 300;
  }, Boolean);
  await js("document.querySelector('.cm-content').focus()"); key("Home", ["control"]); key("Right");
  await until("explicit logical cursor", () => js<number>("document.querySelector('.cm-content').cmView.rootView.view.state.selection.main.anchor"), (value) => value === 1);
  await js(`(() => { const v=document.querySelector('.cm-content').cmView.rootView.view;globalThis.__taskHistory={editor:document.querySelector('.cm-content'),graphs:[...document.querySelectorAll('.react-flow')],cameras:[...document.querySelectorAll('.react-flow__viewport')].map(n=>n.style.transform),source:v.state.doc.toString(),cursor:v.state.selection.main.anchor}; })()`);
  const retained = async () => {
    const result = await js<Record<string, boolean>>(`(() => { const m=globalThis.__taskHistory,v=document.querySelector('.cm-content').cmView.rootView.view;
      return {editor:m.editor===document.querySelector('.cm-content'),graphs:m.graphs.length===document.querySelectorAll('.react-flow').length && m.graphs.every((n,i)=>n===document.querySelectorAll('.react-flow')[i]),
        cameras:JSON.stringify(m.cameras)===JSON.stringify([...document.querySelectorAll('.react-flow__viewport')].map(n=>n.style.transform)),source:m.source===v.state.doc.toString(),cursor:m.cursor===v.state.selection.main.anchor}; })()`);
    assert(Object.values(result).every(Boolean), `Exact source/cursor/graph retention: ${JSON.stringify(result)}`);
  };
  await click(".task-show-details");
  await click(".task-detail:not(.task-document) .task-attach button");
  const proposal = ".agent-task-proposal";
  await until("deliberate task proposal", () => has(proposal), Boolean);
  await click(`${proposal} [data-task-attachment='append']`);
  await until("one attached task", () => has(".agent-task-slot"), Boolean);
  assert.equal(await js("document.querySelector('.agent-draft textarea').value"), "");
  assert.deepEqual(mutations(), [], "source/task inspection and attachment issue no agent command");
  await retained();
  await click(".agent-draft .agent-primary");
  await until("real task preparation", () => has(".agent-draft .agent-launch-context"), Boolean);
  const expand = async (scope: string, summary: string) => {
    const index = await js<number>(`[...document.querySelectorAll(${q(scope + " > details")})].findIndex(n=>n.querySelector('summary').textContent===${q(summary)})`);
    assert(index >= 0);
    const selector = `${scope} > details:nth-of-type(${index + 1})`;
    if (!await js<boolean>(`document.querySelector(${q(selector)}).open`)) await click(`${selector} > summary`);
    return selector;
  };
  const contextSelector = ".agent-draft .agent-launch-context";
  const taskDetail = await expand(contextSelector, "Recorded repository task · immutable");
  const content = await text(`${taskDetail} > pre`), decoded = JSON.parse(content);
  const blob = execFileSync("git", ["-C", fixture.root, "rev-parse", `${fixture.firstCommit.hex}:.ditz/issue-${fixture.taskId}.yaml`], { encoding: "utf8", timeout: 5000 }).trim();
  assert.deepEqual(decoded, { kind: "repository-task-data", version: 1, trust: "untrusted", title: fixture.title,
    description: fixture.description, reference: { version: 1, worldId: "world:working", repositoryId: `repository:${hash(fixture.root)}`,
      provider: "ditz", taskId: fixture.taskId, metadataCommit: fixture.firstCommit, issueBlob: { algorithm: "sha1", hex: blob } } });
  assert.equal(content, canonical(decoded));
  await taskScreenshot(taskDetail, "01-real-task-prepared-deterministic-only.png");
  // Compact interface zoom is a deliberate ordinary control, not DOM resizing.
  await click(label("Zoom in")); await click(label("Zoom in"));
  await until("actual150% interface", async () => wc.getZoomFactor(), (value) => value === 1.5);
  await retained();
  assert.equal(await text(`${taskDetail} > pre`), content);
  assert.equal(await js("document.documentElement.scrollWidth <= innerWidth + 1"), true);
  await taskScreenshot(taskDetail, "01b-real-task-prepared-150.png");
  await click(".zoom-value");
  await until("actual100% interface restored", async () => wc.getZoomFactor(), (value) => value === 1);
  await retained();
  const promptDetail = await expand(contextSelector, "Exact submitted prompt");
  const prompt = await text(`${promptDetail} > pre`), contextHash = hash(prompt);
  assert((await text(`${contextSelector} > .agent-context-path`)).endsWith(`Context hash: ${contextHash}`));
  assert.equal(await js("document.querySelector('.agent-confirm input').checked"), false);
  await click(".agent-confirm input");
  await until("explicit confirmation", () => js<boolean>("document.querySelector('.agent-confirm input').checked"), Boolean);
  await click('.agent-draft button[type="button"].agent-primary');
  const admitted = await until("one deterministic run admitted", snapshot, (value) => value.runs.length === 1);
  const runId = admitted.runs[0].runId as string;
  const active = await read(runId);
  assert.equal(active.launchContext.contextHash, contextHash);
  assert.equal(active.launchContext.submittedPrompt, prompt);
  assert("contextVersion" in active.launchContext && active.launchContext.repositoryTask);
  assert.equal(active.launchContext.repositoryTask.content, content);
  assert.equal(active.launchContext.repositoryTask.bytes, Buffer.byteLength(content));
  assert.equal(active.launchContext.repositoryTask.digest, hash(content));
  await retained();
  const advanced = await advanceUnrelatedTaskFixture(fixture);
  assert.notEqual(advanced.hex, fixture.firstCommit.hex);
  const beforeRecovery = mutations();
  assert.deepEqual(beforeRecovery.map((entry) => entry.type), ["agent.prepare", "agent.launch"]);
  const complete = await until("deterministic terminal and cleanup, not a model", () => read(runId), (value) => value.state === "completed" && value.cleanup.status === "confirmed", 30000);
  assert.deepEqual(complete.launchContext, active.launchContext);
  const originalTranscript = await transcript(complete);
  await retained();
  const historyScope = ".agent-dock-panel .agent-launch-context";
  await expand(".agent-controls", "Submitted context");
  const historyTask = await expand(historyScope, "Recorded repository task · immutable");
  assert.equal(await text(`${historyTask} > pre`), content);
  assert((await text(`${historyTask} > p`)).includes(`not current Ditz state. Metadata sha1:${fixture.firstCommit.hex}`));
  await taskScreenshot(historyTask, "02-admitted-old-task-after-metadata-advance.png");
  let loads = 0; const loaded = () => { loads++; }; wc.on("did-finish-load", loaded);
  documentEvidence.push(await js("globalThis.__taskResize?.read() ?? null"));
  wc.reload();
  await until("clean renderer reload", async () => loads, (value) => value === 1);
  await installed;
  await until("history after document reload", snapshot, (value) => value.runs.length === 1);
  assert.deepEqual((await read(runId)).launchContext, active.launchContext);
  assert.deepEqual(await transcript(complete), originalTranscript, "renderer reload preserves exact paged record contents and timestamps");
  assert.deepEqual(mutations(), beforeRecovery);
  // Select only this Electron app's exact named local core from its own metrics.
  // No broad process search or renderer-controlled PID; this is an owned crash.
  const cores = app.getAppMetrics().filter((metric) => metric.name === "swarm-ide-local-core");
  assert.equal(cores.length, 1); const oldPid = cores[0]!.pid;
  assert(oldPid > 1 && oldPid !== process.pid);
  const oldGeneration = ledger().generations;
  process.kill(oldPid, "SIGKILL");
  await until("owned old core exited", async () => { try { process.kill(oldPid, 0); return false; } catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; } }, Boolean);
  await until("new actual core generation", async () => ledger().generations, (value) => value === oldGeneration + 1);
  await until("retained history on recovered core", async () => {
    const result = await request({ type: "agent.snapshot" }); return result.ok && result.agent.kind === "snapshot" ? result.agent.snapshot : null;
  }, (value) => value?.runs.length === 1);
  const recovered = await read(runId);
  assert.deepEqual(recovered, complete, "completed run and immutable context survive actual core loss unchanged");
  assert.deepEqual(await transcript(recovered), originalTranscript, "core recovery preserves exact paged record contents and timestamps");
  assert.deepEqual(mutations(), beforeRecovery, "renderer/core recovery never replays Prepare or Launch");
  const runSelector = ".agent-rail .agent-run-select";
  await until("history rail selection", () => has(runSelector), Boolean);
  assert.equal(await js("document.querySelectorAll('.agent-rail .agent-run-select').length"), 1);
  await click(runSelector);
  await until("history materialization view", () => has(historyScope), Boolean);
  await expand(".agent-controls", "Submitted context");
  const recoveredTask = await expand(historyScope, "Recorded repository task · immutable");
  assert.equal(await text(`${recoveredTask} > pre`), content);
  assert((await text(`${recoveredTask} > p`)).includes(`not current Ditz state. Metadata sha1:${fixture.firstCommit.hex}`));
  await taskScreenshot(recoveredTask, "03-recovered-immutable-task-history.png");
  await click(label("Zoom in")); await click(label("Zoom in"));
  await until("recovered history at150%", async () => wc.getZoomFactor(), (value) => value === 1.5);
  assert.equal(await text(`${recoveredTask} > pre`), content);
  assert.equal(await js("document.documentElement.scrollWidth <= innerWidth + 1"), true);
  await taskScreenshot(recoveredTask, "04-recovered-immutable-task-history-150.png");
  assert.deepEqual(mutations(), beforeRecovery);
  wc.removeListener("did-finish-load", loaded);
  assert.equal(await readFile(join(fixture.root, fixture.sourcePath), "utf8"), fixture.sourceText);
  assessTaskRendererErrors(errors); assert.equal(ledger().overflow, false);
  return { run: recovered, transcriptHash: originalTranscript.transcriptHash, originalMetadata: fixture.firstCommit.hex, currentMetadata: advanced.hex, rendererErrors: errors,
    sourceUnchanged: true, replayedCommands: 0, fixtureOnly: true, coreGenerations: ledger().generations, elapsedMs: Date.now() - started };
  } catch (error) { originalFailure = { error }; throw error; }
  finally {
    wc.removeListener("did-finish-load", reinstallDiagnostics);
    await finishTaskDiagnostics(errors, async () => {
      const resize = await js("globalThis.__taskResize?.read() ?? null").catch(() => null);
      documentEvidence.push(resize);
      await writeFile(join(artifacts, "task-resize-diagnostics.json"), JSON.stringify({ phase, consoleEvidence, documentEvidence }, null, 2));
    }, originalFailure);
  }
}

export async function verifyTaskRehearsalClose(profile: string, workspace: string, proof: TaskRehearsalProof) {
  const identity = hash(await realpath(workspace));
  for (const path of [profile, join(profile, "agent-runs"), join(profile, "agent-runs", identity)]) {
    const stat = await lstat(path);
    assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid?.() && (stat.mode & 0o077) === 0);
    assert.equal(await realpath(path), path);
  }
  const handle = await open(join(profile, "agent-runs", identity, "snapshot.json"), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    assert(before.isFile() && before.nlink === 1 && before.uid === process.getuid?.() && (before.mode & 0o777) === 0o600 && before.size > 0 && before.size < 2 * 1024 * 1024);
    const bytes = Buffer.alloc(before.size + 1); let offset = 0;
    while (offset < bytes.length) { const read = await handle.read(bytes, offset, bytes.length - offset, offset); if (!read.bytesRead) break; offset += read.bytesRead; }
    const after = await handle.stat(); assert.equal(offset, before.size); assert.equal(after.size, before.size); assert.equal(after.mtimeMs, before.mtimeMs); assert.equal(after.ctimeMs, before.ctimeMs);
    const raw = bytes.subarray(0, offset), snapshot = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    assert.deepEqual(Object.keys(snapshot).sort(), ["entries", "version"]);
    assert.equal(snapshot.version, 2); assert.equal(snapshot.entries.length, 1);
    const entry = snapshot.entries[0], run = RunSchema.parse(entry.run), receipt = AdmissionReceiptSchema.parse(entry.receipt);
    assert.deepEqual(Object.keys(entry).sort(), ["receipt", "records", "run"]);
    // Existing service.shutdown persists uncertain(run) for every loaded run.
    // For a settled run without pending instructions only updatedAt advances;
    // admit no other drift, backwards clock or unobserved future timestamp.
    assert(Date.parse(run.updatedAt) >= Date.parse(proof.run.updatedAt) && Date.parse(run.updatedAt) <= Date.now());
    assert.deepEqual({ ...run, updatedAt: proof.run.updatedAt }, proof.run);
    assert.equal(receipt.runId, run.runId); assert.equal(receipt.contextHash, run.launchContext.contextHash);
    assert.equal(receipt.admittedAt, run.createdAt);
    assert(Array.isArray(entry.records) && entry.records.length === run.transcript.lastRecord && entry.records.length <= 81);
    entry.records.forEach((raw: unknown, index: number) => assert.equal(TranscriptRecordSchema.parse(raw).recordId, index + 1));
    assert.equal(Buffer.byteLength(JSON.stringify(entry.records)), run.transcript.bytes);
    const transcriptHash = hash(JSON.stringify(entry.records.map((raw: unknown) => TranscriptRecordSchema.parse(raw))));
    assert.equal(transcriptHash, proof.transcriptHash, "persisted transcript must match the independently paged preclose observation");
    assert.equal(hash(run.launchContext.submittedPrompt), run.launchContext.contextHash);
    assert("contextVersion" in run.launchContext && run.launchContext.repositoryTask);
    assert.equal(hash(run.launchContext.repositoryTask.content), run.launchContext.repositoryTask.digest);
    assert.equal(run.launchContext.repositoryTask.reference.metadataCommit.hex, proof.originalMetadata);
    assert.notEqual(proof.originalMetadata, proof.currentMetadata);
    return { bytes: raw.length, digest: hash(raw), runId: run.runId, contextHash: run.launchContext.contextHash,
      records: entry.records.length, transcriptHash, originalMetadata: proof.originalMetadata, currentMetadata: proof.currentMetadata,
      observedUpdatedAt: proof.run.updatedAt, shutdownUpdatedAt: run.updatedAt, immutable: true, snapshot };
  } finally { await handle.close(); }
}
