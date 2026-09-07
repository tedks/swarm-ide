// TEST ONLY: disposable CLI-authored Ditz repository, actual packaged production bridge/core.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_TASK_WORKSPACE_EVIDENCE, packaged = process.env.SWARM_TASK_WORKSPACE_PACKAGE;
const rendererErrors = []; let stage = "startup";
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push({ stage, message: event.message.slice(0, 4096) }); });
  contents.on("render-process-gone", (_event, details) => rendererErrors.push({ stage, message: `Renderer gone: ${details.reason}` }));
});
require(path.join(packaged, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await sleep(40); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now(), fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  assert.equal(path.dirname(fixture.root), process.env.SWARM_TASK_WORKSPACE_SCRATCH);
  await app.whenReady(); assert.equal(app.getPath("userData"), process.env.SWARM_TASK_WORKSPACE_PROFILE);
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window", 30000);
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const has = (s) => run((selector) => Boolean(document.querySelector(selector)), s);
  const text = (s) => run((selector) => document.querySelector(selector)?.textContent ?? "", s);
  const key = (keyCode, modifiers = []) => { wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    if (keyCode === "Enter") wc.sendInputEvent({ type: "char", keyCode: "\r", modifiers });
    wc.sendInputEvent({ type: "keyUp", keyCode, modifiers }); };
  const click = async (selector, exact = null) => {
    await run((s, t) => { const el = [...document.querySelectorAll(s)].find((e) => t === null || e.textContent.trim() === t);
      if (!el || el.disabled) throw new Error(`Missing/disabled ${s}: ${t}`); el.scrollIntoView({ block: "nearest", inline: "nearest" }); }, selector, exact);
    await paint();
    const point = await run((s, t) => { const el = [...document.querySelectorAll(s)].find((e) => t === null || e.textContent.trim() === t), r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (!r.width || !r.height || !el.contains(document.elementFromPoint(x, y))) throw new Error(`Not hit-testable: ${s}: ${t}`);
      return { x: Math.round(x), y: Math.round(y) }; }, selector, exact);
    wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
    wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point }); await paint();
  };
  const shot = async (name) => { await paint(); await fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG()); };
  const sourceState = () => run(() => { const state = document.querySelector(".cm-content")?.cmView?.rootView?.view?.state;
    return state ? { text: state.doc.toString(), anchor: state.selection.main.anchor, head: state.selection.main.head } : null; });
  const cameras = () => run(() => [...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform));
  win.setContentSize(1440, 900); win.focus(); wc.focus(); await paint();
  await run(() => { addEventListener("error", (e) => console.error(e.error?.stack ?? e.message));
    addEventListener("unhandledrejection", (e) => console.error(e.reason?.stack ?? e.reason)); });
  await until(() => has("[data-task-status='observed']"), "actual Ditz observation");
  stage = "source";
  key("P", ["control"]);
  await until(() => has(".command-palette input"), "palette");
  await wc.insertText(fixture.sourcePath); key("Enter");
  await until(async () => (await sourceState())?.text === fixture.sourceText, "real source");
  await run(() => document.querySelector(".cm-content").focus()); key("End", ["control"]);
  await until(async () => (await sourceState())?.anchor === fixture.sourceText.length, "end of source");
  await wc.insertText("// retained task workspace draft");
  const dirty = await sourceState(); assert.equal(dirty.text, `${fixture.sourceText}// retained task workspace draft`);
  stage = "ordinary-task-activation";
  await click("[aria-label='Select task graph-root']");
  await until(async () => (await text(".task-document .task-title")) === "Record explicit planning intent", "one click opens document");
  await until(() => has(".task-update-log li"), "actual pinned Ditz history");
  assert((await text(".task-context")).includes("created"));
  assert((await text(".task-context")).includes("Implement the first independent part"));
  assert((await text(".task-context")).includes("No agent activity in this scope."));
  assert.deepEqual(await sourceState(), dirty);
  await shot("01-task-document-context.png");
  stage = "attachment";
  await click(".task-document .task-attach button");
  await until(() => has(".agent-task-proposal"), "ordinary proposal");
  const action = await has("[data-task-attachment='append']") ? "append" : "attach";
  await click(`[data-task-attachment='${action}']`);
  await until(() => has(".agent-task-slot"), "one draft task slot");
  const draft = await text(".agent-task-slot");
  stage = "graph";
  await click(".lens-tabs button", "Plan");
  await click(".planning-heading button", "Load dependency graph");
  await until(async () => (await text(".planning-status")).includes("0 unread"), "actual dependency graph");
  await until(() => has("[aria-label='Task blockage canvas'] .react-flow__node[data-id='graph-left']"), "graph nodes");
  const beforeCameras = await cameras();
  await click("[aria-label='Task blockage canvas'] .react-flow__node[data-id='graph-left']");
  await until(async () => (await text(".task-document .task-title")) === "Implement the first independent part", "graph click opens document");
  await until(async () => (await text(".task-context")).includes("Record explicit planning intent"), "human blocker title");
  assert.deepEqual(await sourceState(), dirty); assert.equal(await text(".agent-task-slot"), draft);
  assert.deepEqual(await cameras(), beforeCameras);
  await shot("02-task-graph-retained-work.png");
  await click(".task-graph-scope button", "Focus selected task");
  await until(async () => (await text(".task-graph-scope")).includes("3 visible · 2 outside this view"), "focused direct neighborhood");
  await click(".task-context [aria-label='Select dependency graph-root']");
  await until(async () => (await text(".task-document .task-title")) === "Record explicit planning intent", "dependency opens central document");
  await shot("03-focused-task-neighborhood.png");
  await click(".task-document .task-heading button", "Return to source");
  assert.deepEqual(await sourceState(), dirty); assert.equal(await text(".agent-task-slot"), draft);
  assert.equal(await fs.readFile(path.join(fixture.root, fixture.sourcePath), "utf8"), fixture.sourceText);
  assert.equal(rendererErrors.length, 0, JSON.stringify(rendererErrors));
  await fs.writeFile(path.join(evidence, "task-workspace-proof.json"), JSON.stringify({ ok: true, realDitz: true, packagedCore: true,
    inputKind: "disposable CLI-authored Ditz test repository, not production tasks", retainedSource: true, retainedDraft: true, retainedCameras: true,
    clickDocument: true, recordedHistory: true, humanDependencies: true, focusedGraph: true, modelTurns: 0, rendererErrors, milliseconds: Date.now() - started }));
}
main().catch(async (error) => { await fs.writeFile(path.join(evidence, "task-workspace-failure.json"), JSON.stringify({ stage, message: error.stack ?? String(error), rendererErrors })); console.error(error); });
