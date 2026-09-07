// Manual proof: native input, unchanged packaged main/preload/core, passive IPC
// observation only. No fixture provider or direct renderer bridge requests.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const { classifyRendererDiagnostics } = require("../demo-plans/diagnostics.cjs");
const evidence = process.env.SWARM_SYNTAX_EVIDENCE;
const errors = [], requests = []; let stage = "startup", currentWindow;
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, (event, input) => {
  if (channel === "swarm:request") {
    if (requests.length >= 10000) throw new Error("Syntax request observation bound");
    requests.push({ type: input.type, ...(input.path ? { path: input.path } : {}) });
  }
  return listener(event, input);
});
app.on("web-contents-created", (_event, wc) => {
  wc.on("console-message", (event) => { if (event.level === "error") errors.push({ stage, message: event.message }); });
  wc.on("render-process-gone", (_event, info) => errors.push({ stage, message: `Renderer gone: ${info.reason}` }));
});
require(path.join(process.env.SWARM_SYNTAX_PACKAGE, "app/electron/main.js"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await delay(50); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const repository = JSON.parse(await fs.readFile(path.join(evidence, "repository.json"), "utf8"));
  await app.whenReady();
  assert.equal(app.getPath("userData"), process.env.SWARM_SYNTAX_PROFILE);
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window selected", 30000);
  const win = currentWindow = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  assert.equal(wc.getURL(), pathToFileURL(path.join(process.env.SWARM_SYNTAX_PACKAGE, "renderer/index.html")).href);
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => {
    addEventListener("error", (event) => console.error(event.error?.stack ?? event.message));
    addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason));
  });
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const click = async (selector) => {
    await run((s) => { const e = document.querySelector(s); if (!e || e.disabled) throw new Error(`Missing/disabled ${s}`);
      e.scrollIntoView({ block: "nearest", inline: "nearest" }); }, selector);
    await paint();
    const p = await run((s) => {
      const e = document.querySelector(s), r = e.getBoundingClientRect();
      let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
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
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    wc.sendInputEvent({ type: "keyUp", keyCode, modifiers }); await paint();
  };
  const source = () => run(() => {
    const state = document.querySelector(".source-surface:not([hidden]) .cm-content")?.cmView?.rootView?.view?.state;
    return state ? { path: document.querySelector(".source-surface header strong").textContent,
      text: state.doc.toString(), anchor: state.selection.main.anchor, head: state.selection.main.head } : null;
  });
  const cameras = () => run(() => [...document.querySelectorAll(".graphs-grid .react-flow__viewport")].map((e) => e.style.transform));
  const diskEquals = async (files) => { for (const [name, content] of Object.entries(files))
    assert.equal(await fs.readFile(path.join(repository.root, name), "utf8"), content, `disk bytes: ${name}`); };
  const open = async (name) => {
    await click(".command-trigger");
    await until(() => run(() => document.activeElement?.getAttribute("aria-label") === "Workspace command"), "palette native focus");
    await wc.insertText(name);
    const selector = `[data-file-search-path=${JSON.stringify(name)}]`;
    await until(() => run((s) => Boolean(document.querySelector(s)), selector), `actual Git filename search ${name}`);
    await click(selector);
    await until(async () => (await source())?.path === name && (await source())?.text === repository.files[name], `actual source ${name}`);
  };
  const colors = {};
  const inspectColors = async (name, tokens) => {
    await until(() => run((expected) => {
      const content = document.querySelector(".source-surface .cm-content"), base = content && getComputedStyle(content).color;
      return content && expected.every((token) => [...content.querySelectorAll(".cm-line span")].some((e) => e.textContent.includes(token) && getComputedStyle(e).color !== base));
    }, tokens), `computed ${name} token colors`);
    colors[name] = await run(() => {
      const content = document.querySelector(".source-surface .cm-content");
      return { base: getComputedStyle(content).color, tokens: [...content.querySelectorAll(".cm-line span")]
        .map((e) => ({ text: e.textContent, color: getComputedStyle(e).color })) };
    });
    assert(new Set(colors[name].tokens.map((token) => token.color).filter((color) => color !== colors[name].base)).size >= 2,
      `${name} has at least two actual non-base token colors`);
    await paint(); await fs.writeFile(path.join(evidence, `${name.replaceAll(".", "-")}.png`), (await wc.capturePage()).toPNG());
  };
  win.focus(); wc.focus();
  await until(() => run(() => Boolean(document.querySelector(".command-trigger"))), "real workbench ready");
  stage = "typescript";
  await open("syntax.ts"); await inspectColors("syntax.ts", ["export", '"hello"', "// Syntax"]);
  await click(".source-surface .cm-content"); await key("End", ["control"]);
  assert(await run(() => document.activeElement === document.querySelector(".source-surface .cm-content")), "native editor focus");
  assert.deepEqual(await source(), { path: "syntax.ts", text: repository.files["syntax.ts"],
    anchor: repository.files["syntax.ts"].length, head: repository.files["syntax.ts"].length }, "native append position");
  const note = "\n// unsaved syntax note\n";
  await key("Enter"); await wc.insertText("// unsaved syntax note"); await key("Enter");
  await until(async () => (await source())?.text === repository.files["syntax.ts"] + note, "native unsaved source edit");
  // Set a known nonterminal cursor without assuming visual arrow movement at
  // the boundary between a text line and the terminal empty line.
  await key("Home", ["control"]); assert.equal((await source()).head, 0);
  await key("End");
  const retainedSource = await source();
  assert.equal(retainedSource.anchor, retainedSource.text.indexOf("\n")); assert.equal(retainedSource.head, retainedSource.anchor);
  await fs.writeFile(path.join(evidence, "native-edit.json"), JSON.stringify({ before: repository.files["syntax.ts"], after: retainedSource }, null, 2));
  await diskEquals(repository.files);

  // Let initial source-open layout finish; tab activation must preserve cameras.
  let prior = "", stableAt = Date.now();
  await until(async () => { const value = JSON.stringify(await cameras()); if (value !== prior) { prior = value; stableAt = Date.now(); }
    return Date.now() - stableAt >= 300; }, "independent graph cameras settled");
  const retainedCameras = await cameras(); assert(retainedCameras.length >= 2);
  stage = "json";
  await open("settings.json"); await inspectColors("settings.json", ['"enabled"', "true", "42"]);
  stage = "markdown";
  await open("README.md"); await inspectColors("README.md", ["Syntax proof", "inline code"]);
  stage = "retention";
  await click('.surface-tab-main[title="syntax.ts"]');
  await until(async () => (await source())?.path === "syntax.ts", "return to dirty TypeScript tab");
  assert.deepEqual(await source(), retainedSource, "exact dirty source path/text/logical cursor retained");
  assert.equal(await run(() => document.querySelector(".artifact-context")?.dataset.contextSubject), "syntax.ts");
  assert.deepEqual(await cameras(), retainedCameras, "tab source selection preserves independent graph cameras");
  await diskEquals(repository.files);
  assert.deepEqual(requests.filter((request) => request.type === "file.write"), [], "draft never wrote to disk");
  await inspectColors("syntax.ts", ["export", '"hello"', "// unsaved syntax note"]);

  stage = "owned-save";
  await click(".source-surface .file-state button");
  await until(() => run(() => Boolean(document.querySelector(".source-surface .file-saved"))), "real owned disk save");
  await diskEquals({ ...repository.files, "syntax.ts": retainedSource.text });
  assert.deepEqual(await source(), retainedSource, "save retains exact source and cursor");
  assert.deepEqual(requests.filter((request) => request.type === "file.write"), [{ type: "file.write", path: "syntax.ts" }]);
  for (const name of Object.keys(repository.files)) assert(requests.some((request) => request.type === "file.read" && request.path === name));
  const modelRequests = requests.filter((request) => ["agent.launch", "agent.steer", "agent.cancel"].includes(request.type));
  assert.deepEqual(modelRequests, []);
  const diagnostics = classifyRendererDiagnostics(errors); assert.deepEqual(diagnostics.blockingErrors, []);
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, packagedCore: true, commit: repository.commit,
    colors, retained: true, retainedSource, retainedCameras, diskUnchangedBeforeSave: true, savedOwnedFile: "syntax.ts",
    modelRequests, requests, rendererErrors: errors, ...diagnostics }, null, 2));
}
main().catch(async (error) => {
  if (currentWindow && !currentWindow.isDestroyed()) {
    await fs.writeFile(path.join(evidence, "failure.png"), (await currentWindow.webContents.capturePage()).toPNG());
    await fs.writeFile(path.join(evidence, "failure-dom.txt"), await currentWindow.webContents.executeJavaScript("document.body.innerText").catch(() => ""));
    const source = await currentWindow.webContents.executeJavaScript(`(() => {
      const content = document.querySelector('.source-surface .cm-content'), state = content?.cmView?.rootView?.view?.state;
      return state ? { text: state.doc.toString(), selection: state.selection.toJSON(), html: content.innerHTML } : null;
    })()`).catch(() => null);
    await fs.writeFile(path.join(evidence, "failure-source.json"), JSON.stringify(source, null, 2));
  }
  await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ stage, error: error.stack, rendererErrors: errors }, null, 2));
  console.error(error);
});
