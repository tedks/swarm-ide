// TEST ONLY: real registered transcript reads; all Send calls are intercepted
// before the core and receive a controlled uncertain receipt. No agent is sent
// a message, resumed, or stopped by this driver.
const { app, BrowserWindow, ipcMain } = require("electron");
const { controlledSendEnvelope } = require("./response.cjs");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_ARTIFACT_DIR, errors = [], sends = [], observedMessages = new Map();
const receipt = "30000000-0000-4000-8000-000000000001";
let stage = "startup", sentTarget = null, snapshotResponses = 0;
app.on("web-contents-created", (_event, wc) => {
  wc.on("console-message", (event) => { if (event.level === "error") errors.push({ stage, message: event.message }); });
  wc.on("render-process-gone", (_event, info) => errors.push({ stage, message: `Renderer gone: ${info.reason}` }));
});
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, async (event, input) => {
  if (channel !== "swarm:request") return listener(event, input);
  if (input.type === "externalAgents.send") {
    sends.push({ ...input });
    assert.equal(input.sessionId, sentTarget, "Only the deliberate controlled proof target can send");
    assert.equal(sends.length, 1, "An uncertain send must never automatically retry");
    const base = await listener(event, { protocolVersion: input.protocolVersion, requestId: input.requestId, type: "externalAgents.snapshot" });
    assert(base.response.ok, "Actual core is available for read-only observation");
    return controlledSendEnvelope(base, input, receipt);
  }
  if (input.type === "externalAgents.handoff" || /^(?:trusted|agent)\./.test(input.type) && !/\.(?:snapshot|read)$/.test(input.type)) throw new Error("Agent control is prohibited in this proof");
  const response = await listener(event, input);
  if (input.type === "externalAgents.snapshot") snapshotResponses++;
  if (input.type === "externalAgents.read" && response.response?.ok && response.response.external?.kind === "read") {
    const detail = response.response.external.detail;
    observedMessages.set(detail.session.id, detail.entries.filter((entry) => entry.kind === "assistant" || entry.kind === "user").map((entry) => entry.text));
  }
  return response;
});
require(path.join(process.env.SWARM_CONVERSATION_PACKAGE, "app/electron/main.js"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await delay(40); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now(), fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  await app.whenReady();
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window selection", 30000);
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  assert(wc.getURL().startsWith("file:"));
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const layout = () => run(() => {
    const measure = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const r = element.getBoundingClientRect();
      let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
        if (style.overflowX !== "visible") { left = Math.max(left, box.left); right = Math.min(right, box.right); }
        if (style.overflowY !== "visible") { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
      }
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom, scrollHeight: element.scrollHeight,
        visible: { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) },
        clientHeight: element.clientHeight, overflowY: getComputedStyle(element).overflowY };
    };
    return { viewport: { width: innerWidth, height: innerHeight }, dock: measure(".agent-interaction-dock"),
      conversation: measure("[aria-label='Agent conversation']"), messages: measure(".conversation-messages"),
      form: measure("[aria-label='Agent conversation'] form"), textarea: measure("[aria-label='Agent conversation'] textarea"),
      send: measure("[aria-label='Agent conversation'] button[type='submit']") };
  });
  const assertReadable = (measurement) => {
    assert(measurement.messages?.visible.height >= 72, "At least 72 pixels of transcript must remain actually visible");
    const box = measurement.conversation;
    for (const name of ["textarea", "send"]) {
      const element = measurement[name];
      assert(element?.width > 0 && element.height > 0, `${name} has visible dimensions`);
      assert(element.visible.width >= element.width - 0.75 && element.visible.height >= element.height - 0.75,
        `${name} is fully visible through viewport and ancestor clipping`);
      assert(element.x >= box.x - 0.75 && element.y >= box.y - 0.75 && element.right <= box.right + 0.75 && element.bottom <= box.bottom + 0.75,
        `${name} fits inside the conversation box`);
    }
  };
  const click = async (selector) => {
    await run((s) => { const e = document.querySelector(s); if (!e || e.disabled) throw new Error(`Missing/disabled ${s}`); e.scrollIntoView({ block: "nearest", inline: "nearest" }); }, selector);
    await paint();
    const point = await run((s) => {
      const e = document.querySelector(s), r = e.getBoundingClientRect();
      let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
      for (let parent = e.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
        if (style.overflowX !== "visible") { left = Math.max(left, box.left); right = Math.min(right, box.right); }
        if (style.overflowY !== "visible") { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
      }
      const x = (left + right) / 2, y = (top + bottom) / 2;
      if (right <= left || bottom <= top || !e.contains(document.elementFromPoint(x, y))) throw new Error(`Occluded ${s}`);
      return { x: Math.round(x), y: Math.round(y) };
    }, selector);
    wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
    wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point }); await paint();
  };
  const textarea = "[aria-label='Agent conversation'] [aria-label='Session steering'] textarea";
  const current = () => run(() => document.querySelector("[aria-label='Agent conversation']")?.dataset.externalSession);
  const draft = () => run((s) => document.querySelector(s)?.value, textarea);
  const select = async (session) => {
    await click(`[aria-label=${JSON.stringify(`Inspect external agent ${session.label}`)}]`);
    await until(async () => await current() === session.id, "selected exact conversation");
    await until(() => run((s) => !!document.querySelector(s) && !document.querySelector(s).disabled, textarea), "available selected composer");
  };
  const refresh = async () => {
    const before = snapshotResponses;
    await click("[aria-label='Refresh external sessions']");
    await until(() => snapshotResponses > before, "refresh snapshot completed");
    await until(() => run(() => !document.querySelector("[aria-label='Refresh external sessions']")?.disabled), "refresh UI settled");
  };
  win.focus(); wc.focus();
  await run(() => {
    addEventListener("error", (event) => console.error(event.error?.stack ?? event.message));
    addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason));
  });
  const [root, child] = fixture.sessions;
  stage = "automatic real ROOT conversation";
  await until(async () => await current() === root.id, "ROOT selected without an explicit click");
  await until(() => run(() => document.querySelectorAll("[aria-label='Conversation messages'] li").length > 0), "ROOT conversation content");
  const displayedMessages = await run(() => [...document.querySelectorAll("[aria-label='Conversation messages'] li > p")].map((e) => e.textContent));
  assert(displayedMessages.length > 0 && displayedMessages.every((message) => observedMessages.get(root.id)?.includes(message)), "ROOT messages match actual core transcript reads");
  await until(() => run((s) => !!document.querySelector(s) && !document.querySelector(s).disabled, textarea), "ROOT composer available");
  assert.equal(sends.length, 0);
  const layoutBefore = await layout();
  await fs.writeFile(path.join(evidence, "layout-before.json"), JSON.stringify(layoutBefore, null, 2));
  assertReadable(layoutBefore);
  await fs.writeFile(path.join(evidence, "root-default.png"), (await wc.capturePage()).toPNG());
  stage = "retained real source";
  await click("[aria-label='Open file README.md']");
  await until(() => run(() => !!document.querySelector(".source-surface .cm-content")), "disposable source");
  await click(".source-surface .cm-content"); await wc.insertText("Unsaved conversation proof\n");
  await run(() => new Promise((resolve, reject) => {
    let previous = "", stable = 0, count = 0;
    const frame = () => { const value = JSON.stringify([...document.querySelectorAll(".graphs-grid .react-flow__viewport")].map((e) => e.style.transform));
      stable = value === previous ? stable + 1 : 0; previous = value;
      if (stable >= 5) resolve(); else if (++count > 120) reject(new Error("Source camera did not settle")); else requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }));
  const source = () => run(() => {
    const view = document.querySelector(".source-surface .cm-content")?.cmView?.rootView?.view;
    return { text: view.state.doc.toString(), selection: view.state.selection.toJSON(), cameras: [...document.querySelectorAll(".graphs-grid .react-flow__viewport")].map((e) => e.style.transform) };
  });
  const retained = await source();
  await run(() => {
    globalThis.__conversationGraphs = [...document.querySelectorAll(".graphs-grid > *")];
    globalThis.__conversationEditor = document.querySelector(".source-surface .cm-content").cmView.rootView.view;
  });
  stage = "caret during background observation";
  const readsBeforeCaret = snapshotResponses;
  const caret = await run(async () => {
    const editor = globalThis.__conversationEditor, states = [], before = editor.state;
    for (let index = 0; index < 12; index++) {
      const current = document.querySelector(".source-surface .cm-content").cmView.rootView.view;
      const layer = editor.dom.querySelector(".cm-cursorLayer"), cursor = editor.dom.querySelector(".cm-cursor");
      states.push({ sameEditor: current === editor, sameState: current.state === before, focused: editor.hasFocus,
        nativeCaret: getComputedStyle(editor.contentDOM).caretColor, duration: getComputedStyle(layer).animationDuration,
        opacity: getComputedStyle(layer).opacity, cursorHeight: cursor.getBoundingClientRect().height });
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return states;
  });
  assert(caret.every((sample) => sample.sameEditor && sample.sameState && sample.focused && sample.cursorHeight > 0), "background observation preserves editor, state and focus");
  assert(caret.every((sample) => sample.nativeCaret === "rgba(0, 0, 0, 0)" && sample.duration === "1.2s"), "only CodeMirror's normal 1.2-second caret is drawn");
  assert(new Set(caret.map((sample) => sample.opacity)).size > 1, "normal caret blinking observed, not an editor reload");
  assert(snapshotResponses > readsBeforeCaret, "real background fleet observation ran while caret was sampled");
  await fs.writeFile(path.join(evidence, "caret-observation.json"), JSON.stringify(caret, null, 2));
  stage = "per-agent drafts";
  const rootDraft = "Controlled ROOT draft, never delivered\nSecond line", childDraft = "Controlled child draft, never delivered";
  await select(root); await click(textarea); await wc.insertText("Controlled ROOT draft, never delivered");
  wc.sendInputEvent({ type: "keyDown", keyCode: "Enter", modifiers: ["shift"] });
  wc.sendInputEvent({ type: "char", keyCode: "\r", modifiers: ["shift"] });
  wc.sendInputEvent({ type: "keyUp", keyCode: "Enter", modifiers: ["shift"] });
  await wc.insertText("Second line");
  await until(async () => await draft() === rootDraft, "native Shift-Enter inserts a newline");
  assert.equal(sends.length, 0, "Shift-Enter does not send");
  await select(child); await click(textarea); await wc.insertText(childDraft);
  await refresh();
  await until(async () => await current() === child.id && await draft() === childDraft, "refresh preserves explicit child and draft");
  await select(root); assert.equal(await draft(), rootDraft);
  stage = "controlled uncertain Send";
  sentTarget = root.id;
  await click(textarea);
  await run((selector) => {
    globalThis.__chatEnterTrusted = false;
    document.querySelector(selector).addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) globalThis.__chatEnterTrusted = event.isTrusted;
    }, { once: true });
  }, textarea);
  wc.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
  wc.sendInputEvent({ type: "char", keyCode: "\r" });
  wc.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
  await until(() => run(() => !!document.querySelector("[aria-label='Agent conversation'] [data-delivery-status='delivery-unknown']")), "uncertain receipt");
  assert.equal(await run(() => globalThis.__chatEnterTrusted), true, "native Enter reached the textarea");
  assert.equal(await draft(), rootDraft); assert.equal(sends.length, 1);
  assert.equal(sends[0].text, rootDraft); assert.equal(sends[0].sessionId, root.id);
  await select(child); assert.equal(await draft(), childDraft);
  await select(root); assert.equal(await draft(), rootDraft);
  assert.equal(await run(() => document.querySelector("[data-delivery-status='delivery-unknown']")?.textContent.includes("30000000-0000-4000-8000-000000000001")), true);
  stage = "registered worktree open and return";
  assert.equal(await run(() => document.querySelector("[aria-label='Agent conversation'] .conversation-heading button")?.textContent), "Worktree");
  await click("[aria-label='Agent conversation'] .conversation-heading button");
  await until(() => run((worktree) => document.querySelector(".agent-worktree-heading small")?.textContent === worktree, root.contextRoot), "actual registered ROOT worktree");
  await fs.writeFile(path.join(evidence, "registered-worktree.png"), (await wc.capturePage()).toPNG());
  await click(".agent-worktree-heading > button");
  await until(() => run(() => document.querySelector(".worktree-browser-center")?.hidden === true), "return to original workspace");
  assert.equal(await current(), root.id); assert.equal(await draft(), rootDraft);
  await refresh(); await paint();
  assert.equal(sends.length, 1); assert.deepEqual(await source(), retained);
  assert.equal(await run(() => globalThis.__conversationGraphs.every((e) => e.isConnected)), true);
  assert.equal(await fs.readFile(path.join(fixture.root, "README.md"), "utf8"), fixture.source);
  assert.deepEqual(errors, []);
  const layoutAfter = await layout();
  await fs.writeFile(path.join(evidence, "layout-after.json"), JSON.stringify(layoutAfter, null, 2));
  assertReadable(layoutAfter);
  await fs.writeFile(path.join(evidence, "retained-drafts.png"), (await wc.capturePage()).toPNG());
  // Save only the disposable source, after proving no background source writes.
  await click(".file-state button");
  await until(() => run(() => document.querySelector(".file-state")?.classList.contains("file-saved")), "save before owned app close");
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, elapsedMs: Date.now() - started,
    actualRegisteredRead: true, root: root.id, child: child.id, controlledSend: true, actualMessagesSent: 0, modelTurns: 0,
    nativeEnterSend: true, nativeShiftEnterNewline: true, stableCaretDuringBackgroundObservation: true,
    autoRoot: true, perAgentDrafts: true, explicitChoiceSurvivesRefresh: true, uncertainReceiptRetained: true,
    interceptedSendRequests: sends.length, registeredWorktreeOpenAndReturn: true, sourceSelectionAndCamerasRetained: true,
    readableTranscriptAndVisibleComposer: true, visibleTranscriptPixels: { before: layoutBefore.messages.visible.height, after: layoutAfter.messages.visible.height }, rendererErrors: errors }));
  await until(() => fs.access(path.join(evidence, "close-request")).then(() => true, () => false), "capture complete");
  app.quit();
}
main().catch(async (error) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) await fs.writeFile(path.join(evidence, "failure.png"), (await win.capturePage()).toPNG());
  await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ stage, message: error.stack, errors, interceptedSends: sends.length })); app.exit(1);
});
