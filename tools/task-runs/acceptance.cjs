// TEST ONLY: actual TaskTrustedRuns component, controlled presentation values.
// No production App/bridge/core/provider is installed in this view.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_TASK_RUNS_EVIDENCE;
let stage = "startup", remoteRequests = 0;
const errors = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 10000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await pause(30); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now();
  await app.whenReady();
  assert.equal(app.getPath("userData"), process.env.SWARM_TASK_RUNS_PROFILE);
  const win = new BrowserWindow({ width: 1360, height: 900, title: "swarm-ide — Controlled task runs proof",
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, additionalArguments: [process.env.SWARM_RENDERER_PROCESS_ARGUMENT] } });
  const wc = win.webContents;
  wc.on("console-message", (event) => { if (event.level === "error") errors.push({ stage, message: event.message.slice(0, 4096) }); });
  wc.on("render-process-gone", (_event, details) => errors.push({ stage, message: `Renderer gone: ${details.reason}` }));
  wc.session.webRequest.onBeforeRequest((request, respond) => {
    const local = request.url.startsWith("file:") || request.url.startsWith("data:");
    if (!local) remoteRequests++;
    respond({ cancel: !local });
  });
  await win.loadFile(path.join(process.env.SWARM_TASK_RUNS_VIEW, "index.html"));
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window selection", 30000);
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const text = (selector) => run((s) => document.querySelector(s)?.textContent ?? "", selector);
  const click = async (selector) => {
    await run((s) => { const element = document.querySelector(s); if (!element || element.disabled) throw new Error(`Unavailable ${s}`); element.scrollIntoView({ block: "nearest" }); }, selector);
    await paint();
    const point = await run((s) => { const element = document.querySelector(s), rect = element.getBoundingClientRect();
      const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      if (!rect.width || !rect.height || !element.contains(document.elementFromPoint(x, y))) throw new Error(`Not hit-testable ${s}`);
      return { x: Math.round(x), y: Math.round(y) }; }, selector);
    wc.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 });
    wc.sendInputEvent({ type: "mouseUp", ...point, button: "left", clickCount: 1 }); await paint();
  };
  const sourceState = () => run(() => { const state = document.querySelector(".cm-content")?.cmView?.rootView?.view?.state;
    return state ? { text: state.doc.toString(), anchor: state.selection.main.anchor, head: state.selection.main.head } : null; });
  const selectedRuns = () => run(() => [...document.querySelectorAll("[data-trusted-task-run]")].map((node) => node.dataset.trustedTaskRun).sort());
  const token = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const shot = async (name) => { await paint(); await fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG()); };
  await run(() => { addEventListener("error", (e) => console.error(e.error?.stack ?? e.message)); addEventListener("unhandledrejection", (e) => console.error(e.reason?.stack ?? e.reason)); });
  stage = "retain-work";
  assert.deepEqual(await selectedRuns(), [token(1), token(3)]);
  assert.equal(await run(() => typeof window.swarm), "undefined");
  await click(".cm-content"); await wc.insertText("dirty "); await paint();
  const source = await sourceState(); assert(source.text.includes("dirty "));
  await click("#draft"); await wc.insertText(" typed instructions"); await paint();
  const draft = await run(() => document.querySelector("#draft").value);
  assert(draft.includes("typed instructions"));
  await run(() => { window.__retained = { editor: document.querySelector(".cm-editor"), draft: document.querySelector("#draft"), graph: document.querySelector("#graph"), transform: document.querySelector("#graph").style.transform }; });
  const retain = async () => { assert.deepEqual(await sourceState(), source); assert.equal(await run(() => document.querySelector("#draft").value), draft);
    assert(await run(() => { const old = window.__retained; return old.editor === document.querySelector(".cm-editor") && old.draft === document.querySelector("#draft") && old.graph === document.querySelector("#graph") && old.transform === old.graph.style.transform; })); };
  await click(`[data-trusted-task-run='${token(1)}'] summary`);
  assert((await text(".task-trusted-runs")).includes("CONTROLLED OUTPUT task-a"));
  assert((await text(".task-trusted-runs")).includes("aaaaaaaa"));
  assert.equal(await text("#opened"), "Opened: none");
  await shot("01-controlled-task-a.png");
  stage = "late-task-observation";
  await click("#task-b"); await click("#update-b");
  assert.deepEqual(await selectedRuns(), [token(2)]);
  assert((await text(".task-trusted-runs")).includes("CONTROLLED OUTPUT task-b"));
  await click("#update-a");
  assert.deepEqual(await selectedRuns(), [token(2)]);
  assert(!(await text(".task-trusted-runs")).includes("CONTROLLED OUTPUT task-a"));
  assert(!(await text(".task-trusted-runs")).includes("CONTROLLED OUTPUT task-b"));
  assert.equal(await text("#opened"), "Opened: none"); await retain();
  stage = "deliberate-conversation-open";
  await click(`[data-trusted-task-run='${token(2)}'] button`);
  assert.equal(await text("#opened"), `Opened: ${token(2)}`);
  assert.equal(await text("#task-focus"), "Task focus: task-b");
  assert.equal(await text("#issue-status"), "Issue status: open"); await retain();
  stage = "archived-retained";
  await click("#task-a"); await click("#archive");
  assert((await text(".task-trusted-runs")).includes("Archived history"));
  assert((await text(".task-trusted-runs")).includes("Saved history, not a running conversation. No automatic resume."));
  await click(`[data-trusted-task-run='${token(3)}'] summary`);
  await click(`[data-trusted-task-run='${token(3)}'] button`);
  assert.equal(await text("#opened"), `Opened: ${token(2)}, ${token(3)}`);
  await click("#disconnect");
  assert((await text(".task-trusted-runs")).includes("Retained observation"));
  assert(await run(() => [...document.querySelectorAll("[data-trusted-task-run] button")].every((button) => button.disabled)));
  assert.equal(await text("#issue-status"), "Issue status: open"); await retain();
  await shot("02-controlled-retained-history.png");
  assert.equal(remoteRequests, 0); assert.deepEqual(errors, []);
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true,
    evidence: "standalone actual component with controlled references; not integrated App, admission or provider proof",
    exactAssociations: true, lateTaskSwitch: true, deliberateOpen: true, archivedRetained: true,
    codeMirrorTextCursorAndDomRetained: true, draftRetained: true, graphStandInRetained: true,
    callbackCount: 2, modelTurns: 0, remoteRequests, rendererErrors: errors, milliseconds: Date.now() - started }, null, 2));
}
main().catch(async (error) => { await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ stage, error: error.stack ?? String(error), errors, remoteRequests }, null, 2)); console.error(error); });
