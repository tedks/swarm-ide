// Filter-only journey: real CLI-authored Ditz metadata and unchanged packaged
// main/preload/core. Native controls, no renderer/provider state injection.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const { classifyRendererDiagnostics } = require("./diagnostics.cjs");
const evidence = process.env.SWARM_PLANS_EVIDENCE, rendererErrors = [];
let stage = "startup";
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push({ stage, message: event.message }); });
  contents.on("render-process-gone", (_event, details) => rendererErrors.push({ stage, message: details.reason }));
});
require(path.join(process.env.SWARM_PLANS_PACKAGE, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return; await sleep(40); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now(), fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  await app.whenReady();
  assert.equal(app.getPath("userData"), process.env.SWARM_PLANS_PROFILE);
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window");
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const frame = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const click = async (selector, name = null) => {
    await run((s, name) => {
      const node = [...document.querySelectorAll(s)].find((item) => name === null || item.textContent.trim() === name);
      if (!node || node.disabled) throw new Error(`Missing/disabled ${s}: ${name}`);
      node.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, selector, name); await frame();
    const point = await run((s, name) => {
      const node = [...document.querySelectorAll(s)].find((item) => name === null || item.textContent.trim() === name), r = node.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
      if (!r.width || !r.height || !node.contains(document.elementFromPoint(x, y))) throw new Error(`Not hit-testable ${s}: ${name}`);
      return { x, y };
    }, selector, name);
    wc.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 });
    wc.sendInputEvent({ type: "mouseUp", ...point, button: "left", clickCount: 1 }); await frame();
  };
  const graph = '[aria-label="Task dependency graph"]';
  const ids = () => run((g) => [...document.querySelectorAll(`${g} .react-flow__node`)].map((node) => node.dataset.id).sort(), graph);
  const edges = () => run((g) => [...document.querySelectorAll(`${g} .react-flow__edge`)].map((node) => node.dataset.id).sort(), graph);
  const source = () => run(() => { const state = document.querySelector(".cm-content")?.cmView?.rootView?.view?.state;
    return state ? { text: state.doc.toString(), anchor: state.selection.main.anchor, head: state.selection.main.head } : null; });
  const camera = () => run(() => [...document.querySelectorAll('[aria-label="Component design canvas"] .react-flow__viewport')].map((node) => node.style.transform));
  await until(() => run(() => document.querySelector('[data-task-status="observed"]')), "real task observation");
  await click(`${graph} button`, "Load dependency graph");
  await until(() => run((g) => document.querySelector(`${g} .planning-status`)?.textContent.includes("5/5 details read"), graph), "complete real graph");
  assert.deepEqual(await ids(), ["graph-join", "graph-right", "graph-root"]);
  assert.deepEqual(await edges(), [["graph-right", "graph-join"], ["graph-root", "graph-right"]].map(JSON.stringify).sort());
  await fs.writeFile(path.join(evidence, "01-active-tasks.png"), (await wc.capturePage()).toPNG());
  stage = "dirty-source";
  await click('[aria-label="Enter directory src"]');
  await until(() => run(() => document.querySelector('[aria-label="Open file src/main.ts"]')), "source directory");
  await click('[aria-label="Open file src/main.ts"]');
  await until(async () => (await source())?.text === fixture.sourceText, "exact source bytes");
  await click(".cm-content");
  wc.sendInputEvent({ type: "keyDown", keyCode: "End", modifiers: ["control"] });
  wc.sendInputEvent({ type: "keyUp", keyCode: "End", modifiers: ["control"] });
  await until(async () => (await source())?.anchor === fixture.sourceText.length, "native cursor to end");
  await wc.insertText("// retained filter proof");
  await until(async () => (await source())?.text === fixture.sourceText + "// retained filter proof", "dirty editor");
  const retained = await source(), componentCamera = await camera();
  assert.equal(componentCamera.length, 1, "one actual component camera is mounted");
  stage = "filters";
  await click(`${graph} .task-graph-filters summary`);
  await click(`${graph} .task-graph-presets button`, "All");
  await until(async () => (await ids()).length === 5, "all tasks visible");
  assert.equal((await edges()).length, 4);
  assert(await run((g) => document.querySelector(`${g} .planning-inspector`).textContent.includes("Keyboard task outline · 5 shown"), graph));
  assert.deepEqual(await source(), retained);
  assert.deepEqual(await camera(), componentCamera);
  await click(`${graph} .task-graph-presets button`, "Active");
  await until(async () => (await ids()).length === 3, "active restored");
  assert.deepEqual(await source(), retained);
  assert.deepEqual(await camera(), componentCamera);
  await click(`${graph} .task-graph-presets button`, "All");
  await until(async () => (await ids()).length === 5, "all saved for reload");
  await click(`${graph} .task-graph-filters summary`);
  await run((g) => document.querySelector(`${g} .planning-canvas`).scrollIntoView({ block: "nearest" }), graph);
  await frame();
  await fs.writeFile(path.join(evidence, "02-show-completed-retained-source.png"), (await wc.capturePage()).toPNG());
  // Preserve dirty work; prove profile reload separately in mounted tests, not
  // by destroying this editor. The ordinary fixture files stay unchanged.
  assert.equal(await fs.readFile(path.join(fixture.root, fixture.sourcePath), "utf8"), fixture.sourceText);
  assert.deepEqual(rendererErrors, []);
  await fs.writeFile(path.join(evidence, "plans-proof.json"), JSON.stringify({ ok: true, realDitz: true, packagedCore: true, modelTurns: 0,
    elapsedMs: Date.now() - started, rendererErrors, diagnostics: classifyRendererDiagnostics(rendererErrors),
    retained, componentCamera, activeTasks: 3, allTasks: 5, activeEdges: 2, allEdges: 4 }, null, 2));
}
main().catch(async (error) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) await fs.writeFile(path.join(evidence, "failure.png"), (await win.webContents.capturePage()).toPNG());
  await fs.writeFile(path.join(evidence, "plans-failure.json"), JSON.stringify({ stage, error: error.stack, rendererErrors }, null, 2));
});
