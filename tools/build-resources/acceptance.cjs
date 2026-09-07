// Real Electron input and packaged renderer/core; DOM evaluation is observation
// only. No synthetic jobs, mocked bridge responses or renderer state injection.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_RESOURCES_EVIDENCE;
const errors = [], requests = []; let stage = "startup", currentWindow;
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, (event, input) => {
  if (channel === "swarm:request") {
    if (requests.length >= 10000) throw new Error("Resource proof request observation bound");
    requests.push({ stage, type: input.type, refresh: input.refresh });
  }
  return listener(event, input);
});
app.on("web-contents-created", (_event, wc) => {
  wc.on("console-message", (event) => { if (event.level === "error") errors.push({ stage, message: event.message }); });
  wc.on("render-process-gone", (_event, info) => errors.push({ stage, message: `Renderer gone: ${info.reason}` }));
});
require(path.join(process.env.SWARM_RESOURCES_PACKAGE, "app/electron/main.js"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await delay(50); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now(), repository = JSON.parse(await fs.readFile(path.join(evidence, "repository.json"), "utf8"));
  await app.whenReady();
  assert.equal(app.getPath("userData"), process.env.SWARM_RESOURCES_PROFILE);
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window selected", 30000);
  const win = currentWindow = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => {
    addEventListener("error", (event) => console.error(event.error?.stack ?? event.message));
    addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason));
  });
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    wc.sendInputEvent({ type: "keyUp", keyCode, modifiers }); await paint();
  };
  const click = async (selector) => {
    await run((s) => {
      const e = document.querySelector(s);
      if (!e || e.disabled) throw new Error(`Missing/disabled ${s}`);
      e.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, selector);
    await paint();
    const p = await run((s) => {
      const e = document.querySelector(s), r = e.getBoundingClientRect();
      let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right);
      let top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
      for (let parent = e.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
        if (style.overflowX !== "visible") { left = Math.max(left, box.left); right = Math.min(right, box.right); }
        if (style.overflowY !== "visible") { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
      }
      const x = (left + right) / 2, y = (top + bottom) / 2;
      if (right <= left || bottom <= top || !e.contains(document.elementFromPoint(x, y))) throw new Error(`Occluded ${s}`);
      return { x, y };
    }, selector);
    const coordinates = { x: Math.round(p.x * wc.getZoomFactor()), y: Math.round(p.y * wc.getZoomFactor()) };
    wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...coordinates });
    wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...coordinates }); await paint();
  };
  const tabTo = async (selector) => {
    for (let count = 0; count < 90; count += 1) {
      if (await run((s) => document.activeElement?.matches(s), selector)) return;
      await key("Tab");
    }
    throw new Error(`Keyboard Tab did not reach ${selector}`);
  };
  const has = (selector) => run((s) => Boolean(document.querySelector(s)), selector);
  const text = (selector) => run((s) => document.querySelector(s)?.textContent ?? "", selector);
  const shot = async (name) => { await paint(); await fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG()); };
  const source = () => run(() => { const state = document.querySelector(".cm-content")?.cmView?.rootView?.view?.state;
    return state ? { text: state.doc.toString(), anchor: state.selection.main.anchor, head: state.selection.main.head } : null; });
  win.focus(); wc.focus();
  await until(() => has(".build-resources"), "mounted resource instrument");
  const toggle = ".build-resources button[aria-expanded]";
  assert.equal(await run((s) => document.querySelector(s).getAttribute("aria-expanded"), toggle), "false");
  assert.match(await text(toggle), /Example profile/);
  assert(!await has(".resource-example"), "example is initially collapsed");

  stage = "real-source";
  await key("K", ["control"]);
  await until(() => has('[aria-label="Workspace command"]'), "filename palette");
  await wc.insertText(repository.sourcePath);
  await until(() => has('[data-file-search-path="README.md"]'), "real Git filename result");
  await click('[data-file-search-path="README.md"]');
  await until(async () => (await source())?.text === repository.sourceText, "actual README contents");
  await click(".source-surface:not([hidden]) .cm-content");
  await key("End", ["control"]); await wc.insertText("\nUnsaved resource inspection note.\n");
  await key("Left"); await key("Left");
  await until(async () => (await source())?.text.endsWith("Unsaved resource inspection note.\n"), "real unsaved edit");
  const retainedSource = await source();
  assert.equal(await fs.readFile(path.join(repository.root, repository.sourcePath), "utf8"), repository.sourceText);
  await until(() => has(".react-flow__viewport"), "actual graph viewport");
  await run(() => new Promise((resolve, reject) => {
    let prior = "", stable = 0, frames = 0;
    function frame() {
      const value = JSON.stringify([...document.querySelectorAll(".react-flow__viewport")].map((e) => e.style.transform));
      stable = value === prior ? stable + 1 : 0; prior = value;
      if (stable >= 5) resolve(true); else if (++frames > 120) reject(new Error("Graph cameras did not settle")); else requestAnimationFrame(frame);
    } requestAnimationFrame(frame);
  }));
  const cameras = await run(() => {
    globalThis.__resourceProofRetained = { editor: document.querySelector(".cm-content"), graphs: [...document.querySelectorAll(".react-flow")],
      viewports: [...document.querySelectorAll(".react-flow__viewport")] };
    return globalThis.__resourceProofRetained.viewports.map((e) => e.style.transform);
  });
  const retained = async () => {
    assert.deepEqual(await source(), retainedSource, "exact dirty source and logical cursor retained");
    assert.deepEqual(await run(() => [...document.querySelectorAll(".react-flow__viewport")].map((e) => e.style.transform)), cameras, "graph cameras retained");
    assert(await run(() => {
      const saved = globalThis.__resourceProofRetained;
      return saved.editor === document.querySelector(".cm-content") &&
        saved.graphs.every((e, i) => e === document.querySelectorAll(".react-flow")[i]) &&
        saved.viewports.every((e, i) => e === document.querySelectorAll(".react-flow__viewport")[i]);
    }), "editor and graphs remain mounted");
  };
  await shot("01-idle-real-source.png");

  stage = "keyboard-navigation";
  await tabTo(toggle);
  stage = "resource-interactions";
  await key("Enter");
  await until(() => has(".resource-example"), "keyboard expanded example");
  assert.equal(await run((s) => document.querySelector(s).getAttribute("aria-expanded"), toggle), "true");
  const exampleText = await text(".resource-example");
  for (const label of [/illustrative/i, /CPU/, /Memory/, /median/i, /p95/i, /peak/i, /sample/i]) assert.match(exampleText, label);
  assert.equal(await run(() => document.querySelectorAll(".resource-example svg").length), 2, "separate CPU and memory sparklines");
  await retained();
  await shot("02-example-profile.png");
  await tabTo(".resource-example summary");
  assert.equal(await text(".resource-example summary"), "Profile basis");
  await key("Space");
  await until(() => has(".resource-example details[open]"), "keyboard opened profile basis");
  await retained();
  await shot("03-profile-basis.png");
  await key("Space");
  await until(async () => !await has(".resource-example details[open]"), "keyboard closed profile basis");
  await key("Tab", ["shift"]);
  assert(await run((s) => document.activeElement.matches(s), toggle), "Shift+Tab returns to example control");
  await key("Space");
  await until(async () => !await has(".resource-example"), "keyboard collapsed example");
  await retained();
  assert.equal(await fs.readFile(path.join(repository.root, repository.sourcePath), "utf8"), repository.sourceText, "source was never saved or replaced");
  // The existing visible Context task reader polls every five seconds. Record
  // this exact passive read separately; it is not resource telemetry and must
  // not turn a keyboard-only example into a timing-dependent false failure.
  const interactionRequests = requests.filter((request) => request.stage === "resource-interactions");
  const backgroundRequests = interactionRequests.filter((request) => request.type === "tasks.snapshot" && request.refresh === false);
  const resourceRequests = interactionRequests.filter((request) => !backgroundRequests.includes(request));
  const productMutations = requests.filter((request) => /^(agent\.(launch|steer|cancel)|reconciliation\.start|fixture\.reset|file\.write)$/.test(request.type));
  assert.deepEqual(resourceRequests, [], "example controls make no core/provider requests");
  assert.deepEqual(productMutations, [], "no build, source save, or model turn");
  assert.deepEqual(errors, [], "strict renderer error gate");
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, packagedCore: true, keyboard: true,
    retained: true, actualSource: repository.sourcePath, unsavedSourceMatchesDisk: false, sourceDiskUnchanged: true,
    graphCount: cameras.length, example: "illustrative only; no current utilization asserted", exampleText,
    resourceRequests, backgroundRequests, productMutations, rendererErrors: errors, milliseconds: Date.now() - started }, null, 2));
}
main().catch(async (error) => {
  if (currentWindow && !currentWindow.isDestroyed()) {
    await fs.writeFile(path.join(evidence, "failure.png"), (await currentWindow.webContents.capturePage()).toPNG());
    await fs.writeFile(path.join(evidence, "failure-dom.txt"), await currentWindow.webContents.executeJavaScript("document.body.innerText").catch(() => ""));
  }
  await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ stage, error: error.stack, rendererErrors: errors }, null, 2));
  console.error(error);
});
