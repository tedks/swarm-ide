// Ordinary owned-desktop input against the packaged app and this repository.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_DESIGN_EVIDENCE, errors = [];
app.on("web-contents-created", (_event, wc) => wc.on("console-message", (event) => { if (event.level === "error") errors.push(event.message); }));
require(path.join(process.env.SWARM_DESIGN_PACKAGE, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message) { const end = Date.now() + 10000; while (Date.now() < end) { if (await check()) return; await sleep(40); } throw new Error(message); }
async function main() {
  await app.whenReady();
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window selection");
  const wc = BrowserWindow.getAllWindows()[0].webContents;
  BrowserWindow.getAllWindows()[0].setSize(1440, 900);
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const text = (selector) => run((s) => document.querySelector(s)?.textContent ?? "", selector);
  const camera = () => run(() => document.querySelector(".design-graph .react-flow__viewport").style.transform);
  const shot = async (name) => fs.writeFile(path.join(evidence, `${name}.png`), (await wc.capturePage()).toPNG());
  const click = async (selector, label = null) => {
    await run((s, text) => { const n = [...document.querySelectorAll(s)].find((node) => text === null || node.textContent.trim() === text); if (!n || n.disabled) throw new Error(`Missing ${s}: ${text}`); n.scrollIntoView({ block: "nearest" }); }, selector, label);
    await paint();
    const p = await run((s, text) => { const n = [...document.querySelectorAll(s)].find((node) => text === null || node.textContent.trim() === text), r = n.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; if (!n.contains(document.elementFromPoint(x, y))) throw new Error(`Not hit-testable ${s}: ${text}`); return { x, y }; }, selector, label);
    const xy = { x: Math.round(p.x * wc.getZoomFactor()), y: Math.round(p.y * wc.getZoomFactor()) };
    wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...xy }); wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...xy }); await paint();
  };
  await until(() => run(() => document.querySelectorAll(".design-graph .react-flow__node").length === 7 && document.querySelectorAll(".design-graph .react-flow__edge").length === 19), "real seven-component design and nineteen edges");
  const overview = await run(() => {
    const panels = [...document.querySelector(".graph-panels").children];
    window.graphProof = { panels, canvas: document.querySelector(".design-graph .react-flow"), labels: [...document.querySelectorAll(".design-graph .design-edge-label")] };
    return { count: panels.length, heights: panels.map((n) => n.getBoundingClientRect().height), columns: getComputedStyle(document.querySelector(".graph-panels")).gridTemplateColumns };
  });
  assert.equal(overview.count, 4); assert.equal(overview.columns.split(" ").length, 2); assert(overview.heights.every((h) => h >= 210)); await shot("overview");
  await click(".design-graph .react-flow__controls-zoomin"); await sleep(250);
  const rootCamera = await camera();
  await click('.component-graph-card button[aria-label="Refresh design"]');
  await until(() => run(() => !document.querySelector('.component-graph-card button[aria-label="Refresh design"]').disabled), "unchanged refresh"); await sleep(250);
  assert(await run(() => window.graphProof.canvas === document.querySelector(".design-graph .react-flow") && window.graphProof.labels.every((n, i) => n === document.querySelectorAll(".design-graph .design-edge-label")[i])), "unchanged refresh retains canvas and labels");
  assert.equal(await camera(), rootCamera);
  await click(".component-graph-card .design-details summary");
  await click(".design-details aside button", "Cockpit, focus & source");
  await until(() => text('.component-graph-card nav').then((s) => s.includes("Cockpit, focus & source")), "component selected");
  assert(await run(() => window.graphProof.canvas === document.querySelector(".design-graph .react-flow")), "selection retains canvas");
  await click('.component-graph-card nav button', 'Swarm IDE · system design'); await paint();
  assert.equal(await camera(), rootCamera);
  await click(".component-graph-card header button", "Read design");
  await until(() => text(".design-prose").then((s) => s.includes("engineering organization")), "full system document"); await shot("design-reading");
  await click(".design-details aside button", "Cockpit, focus & source");
  await until(() => text(".design-prose").then((s) => s.includes("EditorPane")), "component document");
  await click(".design-implementation button", "app/renderer/App.tsx");
  await until(() => run(() => document.querySelector(".source-surface:not([hidden]) .cm-content")?.textContent.includes("import")), "actual source");
  const compact = await run(() => {
    window.graphProof.editor = document.querySelector(".cm-editor");
    return { columns: getComputedStyle(document.querySelector(".graph-panels")).gridTemplateColumns, editorWidth: document.querySelector(".source-surface").getBoundingClientRect().width, samePanels: window.graphProof.panels.every((n, i) => n === document.querySelector(".graph-panels").children[i]), canvas: window.graphProof.canvas === document.querySelector(".design-graph .react-flow") };
  });
  assert.equal(compact.columns.split(" ").length, 1); assert(compact.editorWidth >= 390); assert(compact.samePanels && compact.canvas);
  await run(() => { const n = document.querySelector(".cm-content"); n.focus(); if (document.activeElement !== n) throw new Error("source focus"); });
  wc.sendInputEvent({ type: "keyDown", keyCode: "Home", modifiers: ["control"] }); wc.sendInputEvent({ type: "keyUp", keyCode: "Home", modifiers: ["control"] });
  wc.insertText("// retained graph proof ");
  await until(() => text(".cm-content").then((s) => s.includes("// retained graph proof ")), "unsaved input");
  const retained = await text(".cm-content"); await shot("source-compact");
  await click(".lens-tabs button", "Workspace");
  assert(await run(() => document.querySelector(".source-surface").hidden && window.graphProof.editor === document.querySelector(".cm-editor")), "overview retains dirty editor");
  await click('.surface-tab-main[title="app/renderer/App.tsx"]');
  assert.equal(await text(".cm-content"), retained);
  assert(await run(() => window.graphProof.editor === document.querySelector(".cm-editor") && window.graphProof.panels.every((n, i) => n === document.querySelector(".graph-panels").children[i])), "instances retained");
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, actualRepo: process.cwd(), packaged: true, topNodes: 7, edges: 19, overview, compact, unchangedRefreshIdentity: true, scopedCameraRoundtrip: true, retainedEditor: true, rendererErrors: errors }));
}
void main().catch(async (error) => { const win = BrowserWindow.getAllWindows()[0]; if (win) await fs.writeFile(path.join(evidence, "failure.png"), (await win.webContents.capturePage()).toPNG()).catch(() => {}); await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ message: error.stack, errors })); app.exit(1); });
