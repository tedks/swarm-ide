// Actual packaged renderer/storage/clipboard. Send is held and intercepted before core;
// no instruction is delivered to a real agent and no model turn is started.
const { app, BrowserWindow, ipcMain, clipboard } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_ARTIFACT_DIR, errors = [], sends = [];
let release, stage = "startup";
const hold = new Promise((resolve) => { release = resolve; });
app.on("web-contents-created", (_event, wc) => {
  wc.on("console-message", (event) => { if (event.level === "error") errors.push({ stage, message: event.message }); });
  wc.on("render-process-gone", (_event, info) => errors.push({ stage, message: info.reason }));
});
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, async (event, input) => {
  if (channel !== "swarm:request") return listener(event, input);
  if (input.type === "externalAgents.send") {
    sends.push(input); assert.equal(sends.length, 1);
    const base = await listener(event, { protocolVersion: input.protocolVersion, requestId: input.requestId, type: "externalAgents.snapshot" });
    assert(base.response.ok); await hold;
    return { ...base, response: { ...base.response, external: { kind: "send", sessionId: input.sessionId,
      receiptId: "30000000-0000-4000-8000-000000000001", status: "queued", message: "Controlled queue receipt" } } };
  }
  if (input.type === "externalAgents.handoff" || /^(?:trusted|agent)\./.test(input.type) && !/\.(?:snapshot|read)$/.test(input.type)) throw new Error("Real agent controls forbidden in outbox proof");
  return listener(event, input);
});
require(path.join(process.env.SWARM_OUTBOX_PACKAGE, "app/electron/main.js"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await delay(30); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now(); await app.whenReady();
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned selection", 30000);
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  assert(wc.getURL().startsWith("file:"));
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const click = async (selector) => {
    const point = await run((s) => {
      const e = document.querySelector(s); if (!e || e.disabled) throw new Error(`Missing ${s}`);
      e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (!e.contains(document.elementFromPoint(x, y))) throw new Error(`Occluded ${s}`);
      return { x: Math.round(x), y: Math.round(y) };
    }, selector);
    wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
    wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
  };
  const input = "[aria-label='Agent conversation'] textarea", send = "[aria-label='Agent conversation'] button[type='submit']";
  const text = "  Controlled outgoing instruction\nKeep this exact text 👋\n";
  const row = () => run(() => {
    const e = document.querySelector(".conversation-outgoing");
    return e ? { text: e.querySelector("p").textContent, status: e.dataset.outgoingStatus } : null;
  });
  await until(() => run((s) => !!document.querySelector(s) && !document.querySelector(s).disabled, input), "real registered composer");
  win.focus(); wc.focus(); stage = "saved before controlled dispatch";
  await click(input); await wc.insertText(text);
  await run((s) => { globalThis.__outboxComposer = document.querySelector(s); }, input);
  const arrow = await run((s, b) => {
    const e = document.querySelector(s), button = document.querySelector(b);
    const frame = e.getBoundingClientRect(), r = button.getBoundingClientRect();
    return { inside: r.left > frame.left && r.right < frame.right && r.top > frame.top && r.bottom < frame.bottom,
      width: r.width, height: r.height, textPadding: parseFloat(getComputedStyle(e).paddingRight),
      name: button.getAttribute("aria-label"), title: button.title };
  }, input, send);
  assert.equal(arrow.inside, true); assert.equal(arrow.name, "Send message"); assert.equal(arrow.title, "Send message");
  assert(arrow.width >= 24 && arrow.width <= 32 && arrow.height >= 24 && arrow.height <= 32);
  assert(arrow.textPadding >= arrow.width + 9);
  await click(send);
  await until(async () => (await row())?.status === "sending", "immediate saved message");
  assert.equal((await row()).text, text); assert.equal(sends.length, 1); assert.equal(sends[0].text, text);
  const saved = await run(() => JSON.parse(localStorage.getItem("swarm.message-outbox.v1")));
  assert.equal(saved.messages[0].text, text); assert.equal(saved.messages[0].status, "sending");
  stage = "pending native composer focus";
  const pendingFocus = await run((s) => {
    const e = document.querySelector(s);
    return { same: e === globalThis.__outboxComposer, focused: document.activeElement === e,
      activeTag: document.activeElement?.tagName, disabled: e.disabled, readOnly: e.readOnly };
  }, input);
  await fs.writeFile(path.join(evidence, "pending-focus.json"), JSON.stringify(pendingFocus, null, 2));
  assert.deepEqual(pendingFocus, { same: true, focused: true, activeTag: "TEXTAREA", disabled: false, readOnly: true });
  release(); await until(async () => (await row())?.status === "queued", "queued without consumption claim");
  assert.equal(await run((s) => document.activeElement === document.querySelector(s) &&
    document.querySelector(s) === globalThis.__outboxComposer && !document.querySelector(s).readOnly, input), true);
  await wc.insertText("Next message without another click");
  assert.equal(await run((s) => document.querySelector(s).value, input), "Next message without another click");
  // Clear only this unsent proof draft using native keys before the existing full-reload check.
  wc.sendInputEvent({ type: "keyDown", keyCode: "A", modifiers: ["control"] });
  wc.sendInputEvent({ type: "keyUp", keyCode: "A", modifiers: ["control"] });
  wc.sendInputEvent({ type: "keyDown", keyCode: "Backspace" });
  wc.sendInputEvent({ type: "keyUp", keyCode: "Backspace" });
  await until(() => run((s) => document.querySelector(s).value === "", input), "native draft clear");
  stage = "full renderer reload";
  await run(() => { globalThis.__outboxPriorDocument = true; });
  const loaded = new Promise((resolve) => wc.once("did-finish-load", resolve));
  wc.reload(); await loaded;
  assert.equal(await run(() => globalThis.__outboxPriorDocument), undefined, "Full document was replaced");
  await until(async () => { try { return (await row())?.status === "queued"; } catch { return false; } }, "retained after full reload");
  assert.equal((await row()).text, text); assert.equal(sends.length, 1);
  await click(".conversation-outgoing button[aria-label='Copy message']");
  await until(() => clipboard.readText() === text, "exact native clipboard text");
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(evidence, "saved-after-reload.json"), JSON.stringify(await run(() => JSON.parse(localStorage.getItem("swarm.message-outbox.v1"))), null, 2));
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ elapsedMs: Date.now() - started, sends: sends.length,
    controlledTransport: true, realModelTurns: 0, savedBeforeReceipt: true, pendingFocus, arrow,
    typedNextWithoutClick: true, reloaded: true, exactClipboard: true, errors }, null, 2));
  await until(() => fs.access(path.join(evidence, "close-request")).then(() => true, () => false), "close request"); win.close();
}
main().catch(async (error) => { await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ stage, message: error.stack, errors, sends: sends.length }, null, 2)); app.exit(1); });
