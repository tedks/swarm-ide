// Test-only native navigation against the packaged app and this real repository.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const evidence = process.env.SWARM_DESIGN_EVIDENCE;
const errors = [];
app.on("web-contents-created", (_event, contents) => contents.on("console-message", (event) => { if (event.level === "error") errors.push(event.message); }));
require(path.join(process.env.SWARM_DESIGN_PACKAGE, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message) { const end = Date.now() + 10000; while (Date.now() < end) { if (await check()) return; await sleep(40); } throw new Error(message); }
async function main() {
  await app.whenReady();
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window selection");
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const click = async (selector, label) => {
    await run((s, text) => { const n = [...document.querySelectorAll(s)].find((node) => node.textContent.trim() === text); if (!n || n.disabled) throw new Error(`Missing ${text}`); n.scrollIntoView({ block: "nearest" }); }, selector, label);
    await run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const p = await run((s, text) => { const n = [...document.querySelectorAll(s)].find((node) => node.textContent.trim() === text), r = n.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; if (!n.contains(document.elementFromPoint(x, y))) throw new Error(`Not hit-testable ${text}`); return { x, y }; }, selector, label);
    const xy = { x: Math.round(p.x * wc.getZoomFactor()), y: Math.round(p.y * wc.getZoomFactor()) };
    wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...xy }); wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...xy });
  };
  const text = (selector) => run((s) => document.querySelector(s)?.textContent ?? "", selector);
  await until(() => text(".lens-tabs").then((s) => s.includes("Plan")), "cockpit ready");
  await click(".lens-tabs button", "Plan");
  await click(".planning-tabs button", "System design");
  await until(() => text(".design-prose").then((s) => s.includes("engineering organization")), "actual system doc");
  const topNodes = await run(() => document.querySelectorAll(".design-graph .react-flow__node").length); assert.equal(topNodes, 7);
  const diagramSize = await run(() => ({ panel: document.querySelector(".design-components").clientHeight, canvas: document.querySelector(".design-graph").clientHeight }));
  assert(diagramSize.panel >= 380 && diagramSize.canvas >= 300, "component diagram must remain readable in the narrow central pane");
  await fs.writeFile(path.join(evidence, "system.png"), (await wc.capturePage()).toPNG());
  await click(".design-details aside button", "Cockpit, focus & source");
  await until(() => text(".design-prose").then((s) => s.includes("EditorPane")), "actual cockpit doc");
  const leaf = await text(".design-implementation-graph"); assert(leaf.includes("//:desktop-bundle") && leaf.includes("//:quality_sources"));
  assert((await text(".design-components")).includes("Files & target definitions"));
  assert((await text(".design-constraints")).includes("dirty source"));
  await fs.writeFile(path.join(evidence, "component.png"), (await wc.capturePage()).toPNG());
  await click(".design-details aside button", "Up one level");
  await until(() => text(".design-prose").then((s) => s.includes("engineering organization")), "return to system");
  assert.deepEqual(errors, []);
  await click(".planning-tabs button", "Plans & components");
  await until(() => run(() => {
    const button = document.querySelector('button[aria-label="Inspect plan design:repository"]');
    return button && !button.disabled && button.closest(".planning-projection")?.hidden === false;
  }), "plan outline visible and ready");
  // The keyboard outline is deliberately available inside its own scroll area.
  // Focus that ordinary button, verify it, then use the native Enter gesture.
  await run(() => {
    const button = document.querySelector('button[aria-label="Inspect plan design:repository"]');
    button.focus();
    if (document.activeElement !== button || button.disabled) throw new Error("Repository outline button did not receive focus");
  });
  wc.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
  wc.sendInputEvent({ type: "char", keyCode: "\r" });
  wc.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
  await until(() => text(".plan-selection-title strong").then((s) => s === "Repository, build & context"), "repository selected by keyboard");
  await click(".planning-tabs button", "System design");
  await until(() => text(".design-prose").then((s) => s.includes("Bazel graph uses an actual per-repository query")), "shared repository component selection");
  await click(".design-implementation button", "Show all 20 source files");
  assert((await text(".design-implementation")).includes("core/project-context/catalog.ts"));
  await fs.writeFile(path.join(evidence, "repository-expanded.png"), (await wc.capturePage()).toPNG());
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, actualRepo: process.cwd(), packaged: true, topNodes, diagramSize, componentBuildGraph: true, documentNavigation: true, sharedOutlineSelection: true, nativeKeyboardOutline: true, expandableSources: true, componentConstraints: true, rendererErrors: errors }));
}
void main().catch(async (error) => { await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ message: error.stack, errors })); app.exit(1); });
