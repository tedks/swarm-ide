const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_HEALTH_EVIDENCE, errors = [], categories = [], writes = [];
let expectedFailure = false;
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => originalHandle(channel, (event, input) => {
  if (channel === "swarm:request" && /^(file\.write|trusted\.(start|send|launch|fork)|agent\.(launch|steer))$/.test(input?.type)) writes.push(input.type);
  return listener(event, input);
});
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => {
    if (event.message.startsWith("[renderer-health]")) categories.push(event.message);
    if (event.level === "error" && !(expectedFailure && (event.message.includes("owned controlled render failure") || event.message === "[renderer-health] render-error"))) errors.push(event.message);
  });
  contents.on("render-process-gone", (_event, details) => errors.push(details.reason));
});
require(path.join(process.env.SWARM_HEALTH_PACKAGE, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 20000) { const deadline = Date.now() + ms; while (Date.now() < deadline) { if (await check()) return; await sleep(50); } throw Error(`Timed out: ${label}`); }
async function main() {
  const started = Date.now(); await app.whenReady();
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned X11 selection");
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const frame = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const click = async (selector) => {
    await run((selector) => { const element = document.querySelector(selector); if (!element) throw Error(`Missing ${selector}`); element.scrollIntoView({ block: "nearest", inline: "nearest" }); }, selector); await frame();
    const point = await run((selector) => { const element = document.querySelector(selector), rect = element.getBoundingClientRect(), x = Math.round(rect.left + rect.width / 2), y = Math.round(rect.top + rect.height / 2); if (!element.contains(document.elementFromPoint(x, y))) throw Error(`Covered ${selector}`); return { x, y }; }, selector);
    wc.sendInputEvent({ type: "mouseMove", ...point }); wc.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 }); wc.sendInputEvent({ type: "mouseUp", ...point, button: "left", clickCount: 1 }); await frame();
  };
  await until(() => run(() => Boolean(document.querySelector('[aria-label="Open file source.ts"]'))), "real repository listing");
  await click('[aria-label="Open file source.ts"]');
  await until(() => run(() => document.querySelector(".cm-content")?.textContent.includes("idle recovery proof")), "real source opened");
  await click(".cm-content"); wc.sendInputEvent({ type: "keyDown", keyCode: "End", modifiers: ["control"] }); wc.sendInputEvent({ type: "keyUp", keyCode: "End", modifiers: ["control"] });
  await wc.insertText("\n// retained unsaved source\n");
  await until(() => run(() => document.querySelector(".cm-content")?.textContent.includes("retained unsaved source")), "dirty editor text");
  const before = await run(() => ({ text: document.querySelector(".cm-content")?.textContent, cameras: [...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform), origin: performance.timeOrigin }));
  // Exercise actual native hiding/showing. This bounded proof is not a multi-hour soak.
  for (let i = 0; i < 3; i++) { win.hide(); await sleep(250); win.show(); await frame(); }
  const after = await run(() => ({ text: document.querySelector(".cm-content")?.textContent, cameras: [...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform), origin: performance.timeOrigin }));
  assert.deepEqual(after, before, "hide/show replaced text, document or camera");
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  await fs.writeFile(path.join(evidence, "before-fault.png"), (await wc.capturePage()).toPNG());
  expectedFailure = true; await click("#simulate-render-failure");
  await until(() => run(() => Boolean(document.querySelector(".renderer-failure"))), "error boundary instead of blank screen");
  const retained = await run(() => [...document.querySelectorAll(".renderer-failure textarea")].map((node) => node.value));
  assert(retained.some((text) => text.includes("retained unsaved source")), "dirty source missing from recovery");
  const blocked = await run(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });
  assert.equal(blocked, true);
  await click('.renderer-failure input[type="checkbox"]');
  assert.equal(await run(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }), false);
  assert(categories.includes("[renderer-health] render-error"));
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  assert.equal(await fs.readFile(path.join(process.env.SWARM_HEALTH_FIXTURE, "source.ts"), "utf8"), "export const message = 'idle recovery proof';\n");
  assert.equal(await run(() => performance.timeOrigin), before.origin);
  await fs.writeFile(path.join(evidence, "recovery-text.png"), (await wc.capturePage()).toPNG());
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, elapsedMs: Date.now() - started, hideShowCycles: 3, retainedSource: true, noReload: true, writes, errors, categories,
    attribution: "Actual packaged main/core and production App/Boundary in test-only renderer entry with explicit render-fault button. Not a historical idle-cause reproduction." }, null, 2));
}
main().catch(async (error) => { try { const win = BrowserWindow.getAllWindows()[0]; if (win) await fs.writeFile(path.join(evidence, "failure.png"), (await win.webContents.capturePage()).toPNG()); } catch {} await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ error: error.stack, errors, categories, writes }, null, 2)); });
