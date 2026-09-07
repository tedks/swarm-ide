// Manual joined walkthrough, unchanged packaged main/preload/core.
// Inputs are native UI gestures; IPC is observed, never replaced.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const { classifyRendererDiagnostics } = require("../demo-plans/diagnostics.cjs");
const evidence = process.env.SWARM_TOUR_EVIDENCE;
const errors = [], requests = []; let stage = "startup", currentWindow;
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, (event, input) => {
  if (channel === "swarm:request") {
    if (requests.length >= 10000) throw new Error("Tour request observation bound");
    requests.push(input.type);
  }
  return listener(event, input);
});
app.on("web-contents-created", (_event, wc) => {
  wc.on("console-message", (event) => { if (event.level === "error") errors.push({ stage, message: event.message }); });
  wc.on("render-process-gone", (_event, info) => errors.push({ stage, message: `Renderer gone: ${info.reason}` }));
});
require(path.join(process.env.SWARM_TOUR_PACKAGE, "app/electron/main.js"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await delay(50); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now(), repository = JSON.parse(await fs.readFile(path.join(evidence, "repository.json"), "utf8"));
  await app.whenReady();
  assert.equal(app.getPath("userData"), process.env.SWARM_TOUR_PROFILE);
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window selected", 30000);
  const win = currentWindow = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => {
    addEventListener("error", (event) => console.error(event.error?.stack ?? event.message));
    addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason));
  });
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const click = async (selector, exactText = null) => {
    await run((s, t) => {
      const e = [...document.querySelectorAll(s)].find((node) => t === null || node.textContent.trim() === t);
      if (!e || e.disabled) throw new Error(`Missing/disabled ${s}: ${t}`);
      e.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, selector, exactText);
    await paint();
    const p = await run((s, t) => {
      const e = [...document.querySelectorAll(s)].find((node) => t === null || node.textContent.trim() === t);
      const r = e.getBoundingClientRect();
      // A source document can be taller than its scrollport. Hit the visible
      // intersection, not the offscreen middle of the whole CodeMirror document.
      let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right);
      let top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
      for (let parent = e.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
        if (style.overflowX !== "visible") { left = Math.max(left, box.left); right = Math.min(right, box.right); }
        if (style.overflowY !== "visible") { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
      }
      const x = (left + right) / 2, y = (top + bottom) / 2;
      if (right <= left || bottom <= top || !e.contains(document.elementFromPoint(x, y))) throw new Error(`Occluded ${s}: ${t}`);
      return { x, y };
    }, selector, exactText);
    const coordinates = { x: Math.round(p.x * wc.getZoomFactor()), y: Math.round(p.y * wc.getZoomFactor()) };
    wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...coordinates });
    wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...coordinates });
    await paint();
  };
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    wc.sendInputEvent({ type: "keyUp", keyCode, modifiers }); await paint();
  };
  const has = (selector) => run((s) => Boolean(document.querySelector(s)), selector);
  const text = (selector) => run((s) => document.querySelector(s)?.textContent ?? "", selector);
  const shot = async (name) => { await paint(); await fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG()); };
  const source = () => run(() => { const state = document.querySelector(".cm-content")?.cmView?.rootView?.view?.state;
    return state ? { text: state.doc.toString(), anchor: state.selection.main.anchor, head: state.selection.main.head } : null; });
  const plan = '[aria-label="Authored plan hierarchy"]';
  const sourcePath = repository.sourcePath, taskId = "repo-task-context-core-d4";
  const sourceBytes = await fs.readFile(path.join(repository.root, sourcePath), "utf8");
  win.focus(); wc.focus();
  await until(() => has("[data-task-status='observed']"), "actual task branch observation", 30000);

  stage = "plan-guidance";
  await click(".lens-tabs button", "Plan");
  await click(".planning-tabs button", "Plans & components");
  await click(`${plan} button`, "Load plan index");
  await until(() => has('[aria-label="Inspect plan component:task-context"]'), "actual authored component");
  await click('[aria-label="Inspect plan component:task-context"]');
  await shot("01-component-guidance.png");
  await click(`${plan} button`, "Read doc · docs/demo/task-context-briefing.md");
  await until(async () => (await source())?.text.includes("human-authored briefing"), "real briefing source");
  await shot("02-authored-briefing.png");
  await click(`${plan} button`, "contract · protocol/agent-task.ts");
  await until(async () => (await source())?.text.includes("TASK_CONTEXT_BYTES"), "real task contract source");
  await click(`${plan} button`, `Open source · ${sourcePath}`);
  await until(async () => (await source())?.text === sourceBytes, "actual implementation source");
  await click(`${plan} button`, `Inspect task · ${taskId}`);
  await until(async () => (await text(".task-detail:not(.task-document) .task-selected-id")) === taskId &&
    (await text(".task-detail:not(.task-document)")).includes("Prepare authoritative pinned repository-task context"), "actual closed D4 detail");
  assert((await text(".task-detail:not(.task-document)")).includes(repository.metadataCommit));
  assert((await text(".task-detail:not(.task-document)")).includes("No explicit file references."));
  await shot("03-actual-task-and-source.png");

  stage = "task-projection";
  await click(".planning-tabs button", "Task blockage");
  await click('[aria-label="Task dependency graph"] button', "Load dependency graph");
  await until(async () => !(await text('[aria-label="Task dependency graph"]')).includes("Reading task details…") &&
    (await run(() => document.querySelectorAll('[aria-label="Task dependency graph"] .react-flow__node').length)) > 0, "bounded actual task graph", 30000);
  const graphCoverage = await text('[aria-label="Task dependency graph"] .planning-status');
  await shot("04-recorded-task-blockage.png");

  stage = "build-observation";
  await click(".lens-tabs button", "System");
  await click('[aria-label="Component graph lenses"] button', "Build graph");
  await until(() => run(() => ["current", "error", "unavailable"].includes(document.querySelector("[data-build-status]")?.dataset.buildStatus) &&
    document.querySelector("[data-build-status]")?.textContent !== "unavailable · No build-graph observation requested."), "bounded build query settlement", 45000);
  // Query status is evidence, never invented graph data or a successful build.
  const buildStatus = await text("[data-build-status]");
  await run(() => document.querySelector(".build-canvas")?.scrollIntoView({ block: "nearest" }));
  await shot("05-build-relationships.png");

  stage = "fixed-source-draft";
  await click(".source-surface:not([hidden]) .cm-content");
  await key("End", ["control"]); await wc.insertText("\n// unsaved evaluator tour note\n");
  await until(async () => (await source())?.text.endsWith("// unsaved evaluator tour note\n"), "native unsaved edit");
  const retainedSource = await source();
  await click(".agent-dock-welcome .agent-primary");
  await until(() => has(".agent-draft textarea"), "source-focused launch draft");
  const instruction = "Explain this module's task revision checks and identify the tests that defend them. Do not change files.";
  await click(".agent-draft textarea"); await key("a", ["control"]); await wc.insertText(instruction);
  await click(".lens-tabs button", "Plan"); await click(".planning-tabs button", "Plans & components");
  await click(`${plan} button`, `Inspect task · ${taskId}`);
  await until(() => has(".task-detail:not(.task-document) .task-attach button:not(:disabled)"), "current explicit attachment");
  await click(".task-detail:not(.task-document) .task-attach button", "Attach this task to draft");
  await click('[data-task-attachment="append"]');
  await until(() => has(".agent-task-slot"), "one actual task slot");
  assert.equal(await run(() => document.querySelector(".agent-draft textarea").value), instruction);
  assert((await text(".agent-draft .agent-context-path")).includes(sourcePath));
  await click(".agent-draft button", "Prepare disk context");
  await until(() => has(".agent-launch-context"), "real pinned task preparation", 20000);
  assert((await text(".agent-launch-context")).includes(repository.metadataCommit));
  assert((await text(".agent-launch-context")).includes(taskId));
  const agent = await run(() => window.swarm.request({ protocolVersion: 7, type: "agent.snapshot", requestId: `tour-policy:${crypto.randomUUID()}` }));
  assert(agent.ok && agent.agent.snapshot.capabilities.controls.launch === false,
    "actual core policy disables launch independently of the confirmation checkbox");
  assert.equal(agent.agent.snapshot.runs.length, 0);
  assert(await run(() => [...document.querySelectorAll(".agent-draft button")].find((e) => e.textContent === "Launch read-only run")?.disabled));
  await click(".agent-launch-context summary", "Recorded repository task · immutable");
  await run(() => document.querySelector(".agent-launch-context details[open] pre")?.scrollIntoView({ block: "nearest" }));
  await shot("06-real-prepared-task.png");
  await click(".agent-launch-context summary", "Exact submitted prompt");
  const exactPrompt = await text(".agent-launch-context details:last-child pre");
  assert(exactPrompt.includes(instruction) && exactPrompt.includes(taskId));
  assert(!exactPrompt.includes("unsaved evaluator tour note"), "unsaved source is not substituted for disk context");
  await shot("07-exact-prepared-prompt.png");

  // Establish retention after deliberate navigation/mounting has settled.
  await run(() => new Promise((resolve, reject) => {
    let prior = "", stable = 0, frames = 0;
    function frame() {
      const value = JSON.stringify([...document.querySelectorAll(".react-flow__viewport")].map((e) => e.style.transform));
      stable = value === prior ? stable + 1 : 0; prior = value;
      if (stable >= 5) resolve(true); else if (++frames > 120) reject(new Error("Graph cameras did not settle")); else requestAnimationFrame(frame);
    } requestAnimationFrame(frame);
  }));
  const retained = await run(() => {
    globalThis.__tourRetained = { source: document.querySelector(".cm-content"), draft: document.querySelector(".agent-draft textarea"),
      graphs: [...document.querySelectorAll(".react-flow__viewport")] };
    return { cameras: globalThis.__tourRetained.graphs.map((e) => e.style.transform),
      draft: globalThis.__tourRetained.draft.value, slot: document.querySelector(".agent-task-slot").textContent };
  });

  stage = "recorded-logical-outcome";
  await until(() => has(".journal-activity-entry"), "committed supervised-generated summary");
  await click(".journal-activity-entry");
  await until(() => has(".journal-panel:not([hidden]) .journal-card[open]"), "Activity main text entry");
  assert((await text(".journal-panel")).includes("no autonomous in-app summarizer"));
  await shot("08-logical-change-main-text.png");
  await click(".journal-card[open] .journal-evidence > summary");
  await shot("09-attributed-evidence.png");
  await click('[aria-label="Close logical changes"]');
  assert.deepEqual(await source(), retainedSource, "source text and logical cursor retained");
  assert.equal(await run(() => document.querySelector(".agent-draft textarea").value), retained.draft);
  assert.equal(await text(".agent-task-slot"), retained.slot);
  assert.deepEqual(await run(() => [...document.querySelectorAll(".react-flow__viewport")].map((e) => e.style.transform)), retained.cameras);
  assert(await run(() => globalThis.__tourRetained.source === document.querySelector(".cm-content") &&
    globalThis.__tourRetained.draft === document.querySelector(".agent-draft textarea") &&
    globalThis.__tourRetained.graphs.every((e, i) => e === document.querySelectorAll(".react-flow__viewport")[i])));
  const productMutations = requests.filter((type) => ["agent.launch", "agent.steer", "agent.cancel"].includes(type));
  assert.deepEqual(productMutations, []);
  const diagnostics = classifyRendererDiagnostics(errors); assert.deepEqual(diagnostics.blockingErrors, []);
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, actualTaskMetadata: true,
    sourceCommit: repository.sourceCommit, metadataCommit: repository.metadataCommit, taskId, packagedCore: true,
    prepared: true, retained: true, graphCoverage, buildStatus, managedLaunchAvailable: agent.agent.snapshot.capabilities.controls.launch,
    journal: "recorded supervised output; not rerun",
    observer: "not configured; omitted, no synthetic substitute", productMutations, rendererErrors: errors,
    ...diagnostics, milliseconds: Date.now() - started }, null, 2));
}
main().catch(async (error) => {
  if (currentWindow && !currentWindow.isDestroyed()) {
    await fs.writeFile(path.join(evidence, "failure.png"), (await currentWindow.webContents.capturePage()).toPNG());
    const body = await currentWindow.webContents.executeJavaScript("document.body.innerText").catch(() => "");
    await fs.writeFile(path.join(evidence, "failure-dom.txt"), body);
  }
  await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ stage, error: error.stack, rendererErrors: errors }, null, 2));
  console.error(error);
});
