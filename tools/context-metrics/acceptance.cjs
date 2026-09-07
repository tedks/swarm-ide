// TEST ONLY: actual packaged main/preload/core with native input and DOM assertions.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_CONTEXT_EVIDENCE, packaged = process.env.SWARM_CONTEXT_PACKAGE;
const rendererErrors = []; let stage = "startup";
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push({ stage, message: event.message.slice(0, 4096) }); });
  contents.on("render-process-gone", (_event, details) => rendererErrors.push({ stage, message: `Renderer gone: ${details.reason}` }));
});
require(path.join(packaged, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 12000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return; await sleep(50); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now(), fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  await app.whenReady(); assert.equal(app.getPath("userData"), process.env.SWARM_CONTEXT_PROFILE);
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window", 30000);
  const win = BrowserWindow.getAllWindows()[0]; assert(win && !win.isDestroyed());
  const wc = win.webContents; win.setContentSize(1400, 850); win.focus(); wc.focus();
  assert(wc.getURL().startsWith("file:"), "actual packaged renderer");
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => { addEventListener("error", (event) => console.error(event.error?.stack ?? event.message)); addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason)); });
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const text = (selector) => run((s) => document.querySelector(s)?.textContent ?? "", selector);
  const click = async (selector) => {
    await until(() => run((s) => Boolean(document.querySelector(s)), selector), `visible control ${selector}`);
    await run((s) => document.querySelector(s).scrollIntoView({ block: "nearest", inline: "nearest" }), selector); await paint();
    const point = await run((s) => {
      const node = document.querySelector(s), box = node.getBoundingClientRect();
      const x = (Math.max(0, box.left) + Math.min(innerWidth, box.right)) / 2, y = (Math.max(0, box.top) + Math.min(innerHeight, box.bottom)) / 2;
      if (!box.width || !box.height || node.disabled || !node.contains(document.elementFromPoint(x, y))) throw new Error(`Occluded control ${s}`);
      return { x, y };
    }, selector);
    const coordinates = { x: Math.round(point.x * wc.getZoomFactor()), y: Math.round(point.y * wc.getZoomFactor()) };
    wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...coordinates });
    wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...coordinates }); await paint();
  };
  const key = (keyCode, modifiers = []) => { wc.sendInputEvent({ type: "keyDown", keyCode, modifiers }); if (keyCode === "Enter") wc.sendInputEvent({ type: "char", keyCode: "\r", modifiers }); wc.sendInputEvent({ type: "keyUp", keyCode, modifiers }); };
  const command = async (name) => {
    await click(".command-trigger"); await click(".command-palette input");
    await until(() => run(() => document.activeElement?.getAttribute("aria-label") === "Workspace command"), "palette input owns native focus");
    key("a", ["control"]); await wc.insertText(name);
    await until(() => run((expected) => document.querySelector(".command-palette input")?.value === expected &&
      document.querySelector(".command-results button[aria-current='true'] span")?.firstChild?.textContent === expected, name), "filtered command acknowledged");
    key("Enter");
  };
  const open = async (source) => {
    await command("Open repository path");
    await until(() => run(() => document.querySelector(".command-palette input")?.getAttribute("aria-label") === "Exact repository path"), "exact path mode");
    await until(() => run(() => document.activeElement?.getAttribute("aria-label") === "Exact repository path"), "exact path input focus");
    key("a", ["control"]); await wc.insertText(source);
    await until(() => run((expected) => document.querySelector(".command-palette input")?.value === expected, source), "exact path text acknowledged");
    await paint(); key("Enter");
    await until(async () => (await text(".source-surface header strong")) === source && await run((p) => document.querySelector(".artifact-context")?.dataset.contextSubject === p, source), `source/Context ${source}`);
  };
  const state = () => run(() => { const s = document.querySelector(".cm-content")?.cmView?.rootView?.view?.state; return s ? { text: s.doc.toString(), anchor: s.selection.main.anchor, head: s.selection.main.head } : null; });
  const screenshot = async (name, section) => { await run((selector) => document.querySelector(selector)?.scrollIntoView({ block: "center" }), section); await paint(); await fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG()); };
  stage = "tagged-context"; await open(fixture.sourcePath);
  await until(async () => (await text("[data-context-section='capture']")).includes("//a:consumer"), "Context-only real query direct membership", 45000);
  assert((await text("[data-context-section='latency']")).includes("Illustrative"));
  assert((await text("[data-context-section='latency']")).includes("31.6"));
  assert((await text(".context-global")).includes("Not configured"));
  const allContext = await text("#information-panel");
  for (const removed of ["Providers not available", "Local editor buffer", "SHA-256"]) assert(!allContext.includes(removed));
  await screenshot("01-illustrative-latency.png", "[data-context-section='latency']");
  await run(() => document.querySelector(".cm-content").focus()); key("End", ["control"]); await wc.insertText("// unsaved Context proof");
  await until(async () => (await state())?.text === `${fixture.sourceText}// unsaved Context proof`, "dirty source");
  const dirty = await state();
  await command("Ask an agent about this focus");
  await until(() => run(() => Boolean(document.querySelector(".agent-draft textarea"))), "fixed-focus draft");
  await run(() => document.querySelector(".agent-draft textarea").focus());
  await wc.insertText("Explain the Context relationships; do not execute anything.");
  const draftState = () => run(() => ({ text: document.querySelector(".agent-draft textarea")?.value, source: document.querySelector(".agent-context-path")?.textContent }));
  await until(async () => (await draftState()).text?.includes("Explain the Context relationships"), "draft text acknowledged");
  const draft = await draftState();
  stage = "reverse-membership"; await open("b/data.txt");
  assert((await text("[data-context-section='capture']")).includes("//b:library"));
  assert((await text("[data-context-section='indirect-targets']")).includes("//a:consumer"));
  assert(!(await text("[data-context-section='indirect-targets']")).includes("//b:isolated"));
  assert((await text("[data-context-section='latency']")).includes("No latency profile"));
  await screenshot("02-direct-and-indirect-targets.png", "[data-context-section='capture']");
  stage = "empty-contrast"; await open("README.md");
  assert((await text("[data-context-section='capture']")).includes("No targets"));
  assert((await text("[data-context-section='deployments']")).includes("No services"));
  await screenshot("03-empty-context-global.png", ".context-global");
  await open(fixture.sourcePath); assert.deepEqual(await state(), dirty, "dirty text and logical cursor retained");
  assert.deepEqual(await draftState(), draft, "fixed draft/source association retained across Context switches");
  assert.equal(await fs.readFile(path.join(fixture.root, fixture.sourcePath), "utf8"), fixture.sourceText, "no source write");
  // Inspection/cursor motion does not recreate graph instances or reframe them.
  const cameras = await run(() => { globalThis.__contextGraphs = [...document.querySelectorAll(".react-flow__viewport")]; return globalThis.__contextGraphs.map((node) => node.style.transform); });
  assert(cameras.length > 0);
  await run(() => document.querySelector(".cm-content").focus()); key("ArrowLeft"); await paint();
  assert.deepEqual(await run(() => globalThis.__contextGraphs.map((node) => ({ connected: node.isConnected, transform: node.style.transform }))), cameras.map((transform) => ({ connected: true, transform })));
  assert.equal(rendererErrors.length, 0, JSON.stringify(rendererErrors));
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, realBazel: true, packagedCore: true, sourceCamerasRetained: true, modelTurns: 0, rendererErrors,
    contexts: [fixture.sourcePath, "b/data.txt", "README.md"], draftRetained: true,
    graphScope: "All mounted graph identities and cameras through final source cursor movement; directory navigation intentionally follows explicit source paths",
    latency: "Explicit saved-source demo tag; authored figures, not production telemetry", elapsedMs: Date.now() - started }));
}
main().catch(async (error) => {
  const contents = BrowserWindow.getAllWindows()[0]?.webContents;
  const inputState = contents ? await contents.executeJavaScript(`({active: document.activeElement?.outerHTML.slice(0,1024), palette: document.querySelector('.command-palette')?.innerText.slice(0,1024)})`).catch(() => null) : null;
  await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ stage, message: error.stack ?? String(error), rendererErrors, inputState }));
  const win = BrowserWindow.getAllWindows()[0]; if (win && !win.isDestroyed()) await fs.writeFile(path.join(evidence, "failure.png"), (await win.webContents.capturePage()).toPNG());
  process.exitCode = 1;
});
