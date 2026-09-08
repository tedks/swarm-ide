// TEST ONLY: native mouse/keyboard input into the actual packaged main/preload/core.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_LINK_EVIDENCE, rendererErrors = []; let stage = "startup";
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push({ stage, message: event.message.slice(0, 4096) }); });
  contents.on("render-process-gone", (_event, details) => rendererErrors.push({ stage, message: `Renderer gone: ${details.reason}` }));
});
require(path.join(process.env.SWARM_LINK_PACKAGE, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 12000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return; await sleep(50); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now(), fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  const originals = await Promise.all(["a/BUILD", "b/BUILD.bazel", "b/data.txt"].map(async (name) => [name, await fs.readFile(path.join(fixture.root, name), "utf8")]));
  await app.whenReady(); assert.equal(app.getPath("userData"), process.env.SWARM_LINK_PROFILE);
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window", 30000);
  const win = BrowserWindow.getAllWindows()[0]; assert(win && !win.isDestroyed());
  const wc = win.webContents; win.setContentSize(1450, 900); win.focus(); wc.focus();
  assert(wc.getURL().startsWith("file:"), "actual packaged renderer");
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => { addEventListener("error", (event) => console.error(event.error?.stack ?? event.message)); addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason)); });
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const text = (selector) => run((s) => document.querySelector(s)?.textContent ?? "", selector);
  const mouse = async (point, modifiers = []) => {
    const coordinates = { x: Math.round(point.x * wc.getZoomFactor()), y: Math.round(point.y * wc.getZoomFactor()) };
    for (const type of ["mouseDown", "mouseUp"]) wc.sendInputEvent({ type, button: "left", clickCount: 1, modifiers, ...coordinates });
    await paint();
  };
  const click = async (selector) => {
    await until(() => run((s) => Boolean(document.querySelector(s)), selector), `control ${selector}`);
    await run((s) => document.querySelector(s).scrollIntoView({ block: "nearest", inline: "nearest" }), selector); await paint();
    await mouse(await run((s) => {
      const node = document.querySelector(s), box = node.getBoundingClientRect();
      const x = (Math.max(0, box.left) + Math.min(innerWidth, box.right)) / 2, y = (Math.max(0, box.top) + Math.min(innerHeight, box.bottom)) / 2;
      if (!box.width || !box.height || node.disabled || !node.contains(document.elementFromPoint(x, y))) throw new Error(`Occluded control ${s}`);
      return { x, y };
    }, selector));
  };
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    if (keyCode === "Enter") wc.sendInputEvent({ type: "char", keyCode: "\r", modifiers });
    wc.sendInputEvent({ type: "keyUp", keyCode, modifiers }); await paint();
  };
  const sourceIs = (expected) => until(async () => (await text(".source-surface header strong")) === expected && await run((p) => document.querySelector(".artifact-context")?.dataset.contextSubject === p, expected), `source and Context ${expected}`);
  const open = async (source) => {
    await click(".command-trigger"); await click(".command-palette input");
    await until(() => run(() => document.activeElement?.getAttribute("aria-label") === "Workspace command"), "command input focus");
    await key("a", ["control"]); await wc.insertText("Open repository path");
    await until(() => run(() => document.querySelector(".command-results button[aria-current='true'] span")?.firstChild?.textContent === "Open repository path"), "exact path command");
    await key("Enter");
    await until(() => run(() => document.activeElement?.getAttribute("aria-label") === "Exact repository path"), "path input focus");
    await key("a", ["control"]); await wc.insertText(source);
    await until(() => run((p) => document.querySelector(".command-palette input")?.value === p, source), "path input acknowledged");
    await key("Enter"); await sourceIs(source);
  };
  const state = () => run(() => { const s = document.querySelector(".cm-content")?.cmView?.rootView?.view?.state; return s ? { text: s.doc.toString(), anchor: s.selection.main.anchor, head: s.selection.main.head } : null; });
  const screenshot = async (name) => { await paint(); await fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG()); };
  // Coordinates come from a DOM Range spanning the real editor's text nodes,
  // including syntax-highlighted tokens. No editor state or event is injected.
  const clickString = async (needle, modifiers = []) => {
    await run(() => document.querySelector(".cm-content").scrollIntoView({ block: "center" })); await paint();
    const point = await run((value) => {
      const root = document.querySelector(".cm-content"), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = []; let all = "", node;
      while ((node = walker.nextNode())) { nodes.push({ node, start: all.length }); all += node.textContent; }
      const start = all.indexOf(value); if (start < 0) throw new Error(`No editor text ${value}`);
      const offset = start + Math.floor(value.length / 2), entry = nodes.findLast(({ node, start: at }) => at <= offset && offset < at + node.textContent.length);
      if (!entry) throw new Error("No text range at reference");
      const range = document.createRange(); range.setStart(entry.node, offset - entry.start); range.setEnd(entry.node, offset - entry.start + 1);
      const box = range.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2;
      if (!box.width || !box.height || !root.contains(document.elementFromPoint(x, y))) throw new Error("Reference not visible");
      return { x, y };
    }, needle);
    await mouse(point, modifiers);
  };
  stage = "retain-dirty-source"; await open(fixture.sourcePath); await click(".cm-content"); await key("End", ["control"]);
  await wc.insertText("unsaved navigation note");
  await until(async () => (await state())?.text === `${fixture.sourceText}unsaved navigation note`, "dirty editor text");
  const dirty = await state(); await open("b/data.txt");
  await until(async () => (await text("[data-context-section='capture']")).includes("//b:library") && (await text("[data-context-section='indirect-targets']")).includes("//a:consumer"), "real direct and transitive query", 45000);
  await paint(); await paint();
  const before = await state();
  const cameras = await run(() => { globalThis.__linkGraphs = [...document.querySelectorAll(".react-flow__viewport")]; return globalThis.__linkGraphs.map((node) => node.style.transform); });
  assert(cameras.length > 0, "existing graph instances");
  for (const [target, declaration] of [["//b:library", "b/BUILD.bazel"], ["//a:consumer", "a/BUILD"]]) {
    stage = `Context target ${target}`;
    // Source return is deliberate repository navigation; measure each later
    // target gesture after that navigation has settled, not across its fit.
    await paint(); await paint();
    const targetCameras = await run(() => globalThis.__linkGraphs.map((node) => ({ connected: node.isConnected, transform: node.style.transform })));
    await click(`.artifact-context button[aria-label='Show build target ${target}']`);
    await until(async () => (await text(".build-selection strong")) === target, "exact build target selection");
    assert.deepEqual(await state(), before, "target click preserves source and cursor");
    assert(targetCameras.every(({ connected }) => connected));
    assert.deepEqual(await run(() => globalThis.__linkGraphs.map((node) => ({ connected: node.isConnected, transform: node.style.transform }))), targetCameras, "other graph identities/cameras retained during build target selection");
    await screenshot(target === "//b:library" ? "01-direct-target.png" : "02-transitive-target.png");
    await click(".build-selection button:not([aria-label])"); await sourceIs(declaration);
    if (target === "//b:library") await open("b/data.txt");
  }
  stage = "ordinary-click"; await clickString("//b:library"); await sourceIs("a/BUILD");
  stage = "Alt-click-rule"; await clickString("//b:library", ["alt"]); await sourceIs("b/BUILD.bazel");
  await screenshot("03-alt-click-build-definition.png");
  stage = "Alt-click-file"; await clickString("data.txt", ["alt"]); await sourceIs("b/data.txt");
  assert.equal((await state()).text, originals.find(([name]) => name === "b/data.txt")[1]);
  await screenshot("04-alt-click-source.png");
  stage = "retained-source"; await open(fixture.sourcePath); assert.deepEqual(await state(), dirty, "original dirty source and cursor restored");
  assert(await run(() => globalThis.__linkGraphs.every((node) => node.isConnected)), "original graph instances remain mounted");
  for (const [name, content] of [...originals, [fixture.sourcePath, fixture.sourceText]]) assert.equal(await fs.readFile(path.join(fixture.root, name), "utf8"), content, `no source write: ${name}`);
  assert.equal(rendererErrors.length, 0, JSON.stringify(rendererErrors));
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, realBazel: true, packagedCore: true, dirtySourceRetained: true, graphInstancesRetained: true, rendererErrors, targets: ["//b:library", "//a:consumer"], declarations: ["b/BUILD.bazel", "a/BUILD"], altClick: ["//b:library", "data.txt"], modelTurns: 0, graphScope: "Pre-existing graphs and cameras preserved during target selection; explicit source navigation may move repository camera", elapsedMs: Date.now() - started }));
}
main().catch(async (error) => {
  const win = BrowserWindow.getAllWindows()[0], contents = win?.webContents;
  const inputState = contents ? await contents.executeJavaScript(`({active: document.activeElement?.outerHTML.slice(0,1024), source: document.querySelector('.source-surface header strong')?.textContent, selection: document.querySelector('.build-selection')?.textContent})`).catch(() => null) : null;
  await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ stage, message: error.stack ?? String(error), rendererErrors, inputState }));
  if (win && !win.isDestroyed()) await fs.writeFile(path.join(evidence, "failure.png"), (await contents.capturePage()).toPNG());
  process.exitCode = 1;
});
