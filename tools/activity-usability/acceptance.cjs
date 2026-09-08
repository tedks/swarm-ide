// Native Electron keyboard/pointer input; renderer evaluation only observes DOM
// and editor state. IPC is pass-through observation, never a replacement bridge.
const { app, BrowserWindow, ipcMain } = require("electron");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_ACTIVITY_USABILITY_EVIDENCE;
const errors = [], requests = []; let stage = "startup", currentWindow, interactionDeadline;
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, (event, input) => {
  if (channel === "swarm:request") {
    if (requests.length >= 10000) throw new Error("Activity proof request observation bound");
    requests.push({ stage, type: input.type });
  }
  return listener(event, input);
});
app.on("web-contents-created", (_event, wc) => {
  wc.on("console-message", (event) => { if (event.level === "error") errors.push({ stage, message: event.message }); });
  wc.on("render-process-gone", (_event, info) => errors.push({ stage, message: `Renderer gone: ${info.reason}` }));
});
require(path.join(process.env.SWARM_ACTIVITY_USABILITY_PACKAGE, "app/electron/main.js"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 5000) {
  const deadline = Math.min(Date.now() + ms, interactionDeadline ?? Infinity);
  while (Date.now() < deadline) { if (await check()) return; await delay(40); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const repository = JSON.parse(await fs.readFile(path.join(evidence, "repository.json"), "utf8"));
  await app.whenReady();
  assert.equal(app.getPath("userData"), process.env.SWARM_ACTIVITY_USABILITY_PROFILE);
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window selected", 30000);
  const win = currentWindow = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const key = async (keyCode, modifiers = []) => {
    if (keyCode === "Space") execFileSync("xdotool", ["key", "--clearmodifiers", "space"], { timeout: 2000 });
    else {
      wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
      if (keyCode === "Enter") wc.sendInputEvent({ type: "char", keyCode: "\r", modifiers });
      wc.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    }
    await paint();
  };
  const click = async (selector) => {
    const point = await run((s) => {
      const e = document.querySelector(s);
      if (!e || e.disabled) throw new Error(`Missing/disabled ${s}`);
      const r = e.getBoundingClientRect();
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
    const coordinates = { x: Math.round(point.x * wc.getZoomFactor()), y: Math.round(point.y * wc.getZoomFactor()) };
    wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...coordinates });
    wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...coordinates }); await paint();
  };
  const tabTo = async (selector) => {
    for (let count = 0; count < 90 && Date.now() < interactionDeadline; count += 1) {
      if (await run((s) => document.activeElement?.matches(s), selector)) return;
      await key("Tab");
    }
    throw new Error(`Keyboard Tab did not reach ${selector}`);
  };
  const has = (selector) => run((s) => Boolean(document.querySelector(s)), selector);
  const shot = async (name) => { await paint(); await fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG()); };
  const source = () => run(() => { const state = document.querySelector(".cm-content")?.cmView?.rootView?.view?.state;
    return state ? { text: state.doc.toString(), anchor: state.selection.main.anchor, head: state.selection.main.head } : null; });
  const cameras = () => run(() => [...document.querySelectorAll(".react-flow__viewport")].map((e) => e.style.transform));
  const draft = () => run(() => [...document.querySelectorAll(".agent-draft textarea, .agent-draft input")].map((e) => e.value));
  win.focus(); wc.focus();
  await until(() => run(() => document.querySelectorAll(".observed-activity li[data-event]").length === 2), "two registered raw events", 25000);
  const started = Date.now(); interactionDeadline = started + 15000;
  const observed = await run(() => ({
    outerHeadings: document.querySelectorAll(".dock-activity > .dock-section-heading").length,
    innerHeadings: document.querySelectorAll(".observed-activity > header, .observed-activity h1, .observed-activity h2, .observed-activity h3").length,
    liveBadges: [...document.querySelectorAll(".observed-activity span, .observed-activity p")].filter((e) => e.textContent.trim() === "Live").length,
    events: [...document.querySelectorAll(".observed-activity li[data-event]")].map((e) => ({
      sessionId: e.dataset.session, text: e.querySelector(".observed-activity-event").textContent,
      at: e.querySelector("time").dateTime, title: e.querySelector("time").title,
      accessible: e.querySelector("time").getAttribute("aria-label"), agent: e.querySelector("header button").textContent,
    })),
  }));
  assert.equal(observed.outerHeadings, 1); assert.equal(observed.innerHeadings, 0); assert.equal(observed.liveBadges, 0);
  for (const expected of repository.events) {
    const actual = observed.events.find((event) => event.sessionId === expected.sessionId);
    assert(actual); assert.equal(actual.text, expected.text); assert.equal(actual.at, expected.at);
    assert(actual.title); assert.equal(actual.accessible, actual.title); assert.match(actual.agent, /^Proof fixture [12]$/);
  }
  stage = "real-source";
  await key("K", ["control"]);
  await until(() => has('[aria-label="Workspace command"]'), "filename palette");
  await wc.insertText(repository.sourcePath);
  await until(() => has('[data-file-search-path="README.md"]'), "real Git filename result");
  await click('[data-file-search-path="README.md"]');
  await until(async () => (await source())?.text === repository.sourceText, "actual README contents");
  await click(".source-surface:not([hidden]) .cm-content");
  await key("End", ["control"]); await wc.insertText("Unsaved Activity inspection note."); await key("Left");
  const retainedSource = await source();
  assert.equal(retainedSource.text, repository.sourceText + "Unsaved Activity inspection note.");
  await click('.agent-dock-tabs [role="tab"][aria-label="Native agents / New"]');
  await click(".agent-dock-welcome .agent-primary");
  await until(() => has(".agent-draft textarea"), "unsubmitted launch draft");
  assert(await run(() => document.activeElement?.matches(".agent-draft textarea")), "launch draft autofocus");
  await key("A", ["control"]); await wc.insertText("Unsubmitted proof draft; never launch or send.");
  const retainedDraft = await draft(); assert(retainedDraft.includes("Unsubmitted proof draft; never launch or send."));
  await until(async () => (await cameras()).length > 0, "actual graph viewport");
  await run(() => new Promise((resolve, reject) => {
    let prior = "", stable = 0, frames = 0;
    function frame() {
      const value = JSON.stringify([...document.querySelectorAll(".react-flow__viewport")].map((e) => e.style.transform));
      stable = value === prior ? stable + 1 : 0; prior = value;
      if (stable >= 5) resolve(true); else if (++frames > 120) reject(new Error("Graph cameras did not settle")); else requestAnimationFrame(frame);
    } requestAnimationFrame(frame);
  }));
  const retainedCameras = await cameras();
  const retained = async () => {
    assert.deepEqual(await source(), retainedSource, "exact dirty source and logical cursor retained");
    assert.deepEqual(await draft(), retainedDraft, "unsubmitted draft retained");
    assert.deepEqual(await cameras(), retainedCameras, "graph cameras retained");
  };
  const toggle = 'button[aria-label="Summary settings"]';
  assert(await has(".work-log-settings[hidden]"), "settings initially closed");
  await shot("01-raw-activity-dock.png");
  stage = "summary-settings";
  await tabTo(toggle); await key("Enter");
  await until(() => has(".work-log-settings:not([hidden])"), "keyboard opened settings");
  assert.equal(await run((s) => document.querySelector(s).getAttribute("aria-expanded"), toggle), "true");
  await retained(); await shot("02-summary-settings-open.png");
  assert(await run((s) => document.activeElement.matches(s), toggle), "keyboard focus stays on settings toggle");
  await key("Space");
  await until(() => has(".work-log-settings[hidden]"), "keyboard closed settings");
  assert.equal(await run((s) => document.querySelector(s).getAttribute("aria-expanded"), toggle), "false");
  await retained();
  const centralRefresh = process.env.SWARM_ACTIVITY_CENTRAL_REFRESH === "1"
    ? await require("./central-refresh.cjs")({ repository, run, click, until, retained, shot, requests, stage: (next) => { stage = next; } }) : null;
  assert.equal(await fs.readFile(path.join(repository.root, repository.sourcePath), "utf8"), repository.sourceText, "source was never saved or replaced");
  assert.equal(await fs.readFile(repository.registry, "utf8"), repository.registryText, "registrations unchanged");
  const productMutations = requests.filter(({ type }) => /^(agent\.(prepare|launch|steer|cancel)|externalAgents\.(send|handoff)|trusted\.(prepare|launch|fork|send|decide|stop)|workLog\.(start|stop|record)|reconciliation\.start|fixture\.reset|file\.write)$/.test(type));
  const startupBuildRequests = productMutations.filter((request) => request.stage === "startup" && request.type === "reconciliation.start");
  const unexpectedMutations = productMutations.filter((request) => !startupBuildRequests.includes(request));
  assert(startupBuildRequests.length <= 1, "at most existing single startup reconciliation");
  assert.deepEqual(unexpectedMutations, [], "no model message, control action, Work Log start, or source write");
  assert.deepEqual(errors, [], "strict renderer error gate");
  const interactionMilliseconds = Date.now() - started;
  assert(interactionMilliseconds < 15000, "bounded interactive proof under fifteen seconds");
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, packagedCore: true, keyboard: true,
    rawActivity: true, exactTimestamps: true, retained: true, sourceDiskUnchanged: true, controlledFixture: true, modelMessages: 0,
    actualSource: repository.sourcePath, graphCount: retainedCameras.length, observed, requests, productMutations, startupBuildRequests,
    unexpectedMutations, rendererErrors: errors, interactionMilliseconds, centralRefresh,
    boundary: "Private JSONL proof fixture only; recorded invocations are not executed operations. Existing startup reconciliation recorded separately. No lifecycle glyph claim." }, null, 2));
}
main().catch(async (error) => {
  if (currentWindow && !currentWindow.isDestroyed()) {
    await fs.writeFile(path.join(evidence, "failure.png"), (await currentWindow.webContents.capturePage()).toPNG());
    await fs.writeFile(path.join(evidence, "failure-dom.txt"), await currentWindow.webContents.executeJavaScript("document.body.innerText").catch(() => ""));
  }
  await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ stage, error: error.stack, rendererErrors: errors, requests }, null, 2));
  console.error(error);
});
