// TEST ONLY: real CLI-authored disposable metadata through unchanged packaged main/core.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const evidence = process.env.SWARM_DENSITY_EVIDENCE, packaged = process.env.SWARM_DENSITY_PACKAGE;
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
  assert.equal(path.dirname(fixture.root), process.env.SWARM_DENSITY_SCRATCH);
  await app.whenReady(); assert.equal(app.getPath("userData"), process.env.SWARM_DENSITY_PROFILE);
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window selected", 30000);
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const has = (selector) => run((s) => Boolean(document.querySelector(s)), selector);
  const key = (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    if (keyCode === "Enter") wc.sendInputEvent({ type: "char", keyCode: "\r", modifiers });
    wc.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  };
  const click = async (selector) => {
    await run((s) => document.querySelector(s).scrollIntoView({ block: "nearest" }), selector); await paint();
    const point = await run((s) => {
      const el = document.querySelector(s), rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      if (!rect.width || !rect.height || el.disabled || !el.contains(document.elementFromPoint(x, y))) throw new Error(`Not hit-testable: ${s}`);
      return { x: Math.round(x), y: Math.round(y) };
    }, selector);
    wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
    wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point }); await paint();
  };
  const shot = async (file) => { await paint(); await fs.writeFile(path.join(evidence, file), (await wc.capturePage()).toPNG()); };
  win.setContentSize(1440, 876); win.focus(); wc.focus(); await paint();
  await run(() => {
    addEventListener("error", (event) => console.error(event.error?.stack ?? event.message));
    addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason));
  });
  await until(() => has(".task-panel [data-task-status='observed']"), "actual metadata observation");
  assert(wc.getURL().startsWith(pathToFileURL(path.join(packaged, "renderer/index.html")).href));
  stage = "default-density";
  const defaultView = await run(() => {
    const container = document.querySelector("#sidebar-content-2"), bounds = container.getBoundingClientRect();
    const rows = [...container.querySelectorAll(".task-select")].map((row) => {
      const rect = row.getBoundingClientRect();
      return { title: row.querySelector("strong").textContent, top: rect.top, bottom: rect.bottom,
        visible: rect.top >= bounds.top && rect.bottom <= bounds.bottom && rect.bottom <= innerHeight };
    });
    return { width: innerWidth, height: innerHeight, scrollTop: container.scrollTop, rows,
      visibleTitles: rows.filter((row) => row.visible).map((row) => row.title), bounds: { top: bounds.top, bottom: bounds.bottom } };
  });
  assert.equal(defaultView.width, 1440); assert.equal(defaultView.height, 876); assert.equal(defaultView.scrollTop, 0);
  assert(defaultView.visibleTitles.length >= 3, JSON.stringify(defaultView));
  assert(defaultView.rows.some((row) => row.title === "Record explicit planning intent"));
  await shot("01-task-titles-above-fold.png");
  stage = "ordinary-controls";
  await click(".task-panel input[type='search']"); await wc.insertText("graph-root");
  await until(() => run(() => document.querySelectorAll(".task-panel .task-select").length === 1), "search exact full ID");
  await click(".task-panel .task-filters button:last-child");
  assert(await run(() => document.querySelector(".task-panel .task-filters button:last-child").getAttribute("aria-pressed") === "true"));
  await click(".task-panel .task-select");
  await click(".task-panel .task-revision summary");
  assert(await run((pin) => document.querySelector(".task-panel details").open && document.querySelector(".task-panel details").textContent.includes(pin), fixture.metadataCommit));
  await shot("02-explicit-provenance.png");
  stage = "small-keyboard";
  win.setContentSize(1080, 720); await paint();
  await click("[aria-label='Toggle work panel']");
  await click(".task-panel input[type='search']"); key("A", ["control"]); await wc.insertText("graph-root");
  key("Tab"); await paint();
  assert(await run(() => document.activeElement === document.querySelector(".task-panel .task-filters button:first-child")));
  key("Tab"); key("Tab"); await paint();
  assert(await run(() => document.activeElement?.getAttribute("aria-label") === "Select task graph-root"));
  key("Enter");
  await until(() => run(() => document.querySelector(".task-document")?.textContent.includes("Record explicit planning intent")), "small-window keyboard task document");
  await shot("03-small-keyboard-task.png");
  assert.equal(await fs.readFile(path.join(fixture.root, fixture.sourcePath), "utf8"), fixture.sourceText);
  assert.equal(rendererErrors.length, 0, JSON.stringify(rendererErrors));
  await fs.writeFile(path.join(evidence, "density-proof.json"), JSON.stringify({ ok: true, realDitz: true, packagedCore: true,
    inputKind: "disposable real CLI-authored Ditz metadata, not a production user's tasks", defaultView,
    searchFilterDisclosure: true, smallWindowKeyboardDocument: true, sourceDiskUnchanged: true,
    modelTurns: 0, rendererErrors, milliseconds: Date.now() - started }));
}
main().catch(async (error) => {
  await fs.writeFile(path.join(evidence, "density-failure.json"), JSON.stringify({ stage, message: error.stack ?? String(error), rendererErrors }));
  console.error(error);
});
