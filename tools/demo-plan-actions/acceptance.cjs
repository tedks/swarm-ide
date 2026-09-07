// TEST ONLY: native interactions against actual packaged main/preload/core.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { classifyRendererDiagnostics } = require("../demo-plans/diagnostics.cjs");
const evidence = process.env.SWARM_PLANS_EVIDENCE, packaged = process.env.SWARM_PLANS_PACKAGE;
const rendererErrors = []; let stage = "startup";
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push({ stage, message: event.message.slice(0, 4096) }); });
  contents.on("render-process-gone", (_event, details) => rendererErrors.push({ stage, message: `Renderer gone: ${details.reason}` }));
});
require(path.join(packaged, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 12000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await sleep(40); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now(), fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  assert.equal(path.dirname(fixture.root), process.env.SWARM_PLANS_SCRATCH);
  assert.equal(await fs.realpath(fixture.root), fixture.root);
  await app.whenReady(); assert.equal(app.getPath("userData"), process.env.SWARM_PLANS_PROFILE);
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned native window", 30000);
  const win = BrowserWindow.getAllWindows()[0]; assert(win && !win.isDestroyed());
  const wc = win.webContents;
  win.setContentSize(1440, 876);
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => {
    addEventListener("error", (event) => console.error(event.error?.stack ?? event.message));
    addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason));
  });
  const label = (value) => `[aria-label=${JSON.stringify(value)}]`;
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const request = (body) => run((input) => window.swarm.request({ protocolVersion: 7, requestId: `actions-proof:${crypto.randomUUID()}`, ...input }), body);
  const text = (selector) => run((s) => document.querySelector(s)?.textContent ?? "", selector);
  const has = (selector) => run((s) => Boolean(document.querySelector(s)), selector);
  const click = async (selector, exactText = null) => {
    await run((s, t) => {
      const node = [...document.querySelectorAll(s)].find((node) => t === null || node.textContent.trim() === t);
      if (!node || node.disabled) throw new Error(`Missing/disabled ${s}: ${t}`);
      node.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, selector, exactText);
    await paint();
    const point = await run((s, t) => {
      const node = [...document.querySelectorAll(s)].find((node) => t === null || node.textContent.trim() === t), rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      if (!rect.width || !rect.height || !node.contains(document.elementFromPoint(x, y))) throw new Error(`Not visible/hit-testable ${s}: ${t}`);
      return { x, y };
    }, selector, exactText);
    const coordinates = { x: Math.round(point.x * wc.getZoomFactor()), y: Math.round(point.y * wc.getZoomFactor()) };
    wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...coordinates });
    wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...coordinates }); await paint();
  };
  const focus = (selector) => run((s) => { const node = document.querySelector(s); if (!node) throw new Error(`Missing ${s}`); node.focus(); }, selector);
  const key = (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    if (keyCode === "Enter") wc.sendInputEvent({ type: "char", keyCode: "\r", modifiers });
    wc.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  };
  const screenshot = async (name) => { await paint(); await fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG()); };
  const sourceState = () => run(() => {
    const state = document.querySelector(".cm-content")?.cmView?.rootView?.view?.state;
    return state ? { text: state.doc.toString(), anchor: state.selection.main.anchor, head: state.selection.main.head } : null;
  });
  const graph = label("Authored plan hierarchy");
  win.focus(); wc.focus();
  await until(() => has("[data-task-status='observed']"), "real CLI Ditz observation");
  const world = await request({ type: "workspace.snapshot" }); assert(world.ok);
  assert.equal(world.snapshot.project.name, path.basename(fixture.root));
  assert(wc.getURL().startsWith(pathToFileURL(path.join(packaged, "renderer/index.html")).href));
  await click(".lens-tabs button", "Plan"); await click(".planning-tabs button", "Plans & components");
  await click(`${graph} button`, "Load plan index");
  await until(async () => (await text(`${graph} .planning-status`)).includes(`${fixture.index.nodes.length} authored nodes`), "real working plan index");
  const observed = await request({ type: "plans.read", worldId: world.snapshot.world.id, repositoryId: world.snapshot.project.id });
  assert(observed.ok && observed.plans.status === "observed"); assert.deepEqual(observed.plans.index, fixture.index);
  stage = "selected-primary-actions";
  const selected = fixture.index.nodes.find((node) => node.parentId === null);
  await focus(`${graph} .react-flow__node[data-id="${selected.id}"]`); key("Enter");
  await until(async () => (await text(".plan-selection-primary")).includes(selected.title), "native selected plan inspector");
  const controls = [`Read doc · ${fixture.docPath}`, `Open source · ${fixture.sourcePath}`, `Inspect task · ${selected.taskIds[0]}`, "Why this context?"];
  const measurements = () => run((title, labels) => {
    const inspector = document.querySelector(".plan-selection-inspector").getBoundingClientRect();
    const primary = document.querySelector(".plan-selection-primary"), support = document.querySelector(".plan-selection-support");
    const nodes = [primary.querySelector("strong"), ...labels.map((label) => [...primary.querySelectorAll("button")].find((node) => node.textContent.trim() === label))];
    return { title, scrollTop: support.scrollTop, scrollHeight: support.scrollHeight, clientHeight: support.clientHeight,
      controls: nodes.map((node) => {
        if (!node) throw new Error("Missing primary title/action");
        const r = node.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        return { label: node.textContent.trim(), top: r.top, bottom: r.bottom, fontSize: getComputedStyle(node).fontSize,
          visible: r.width > 0 && r.height > 0 && r.top >= Math.max(0, inspector.top) && r.bottom <= Math.min(innerHeight, inspector.bottom) &&
            r.left >= inspector.left && r.right <= inspector.right && node.contains(document.elementFromPoint(x, y)) };
      }) };
  }, selected.title, controls);
  await paint(); const beforeScroll = await measurements();
  assert(beforeScroll.controls.every((control) => control.visible), "title and all primary controls visible before supporting scroll");
  await run(() => { const support = document.querySelector(".plan-selection-support"); support.scrollTop = support.scrollHeight; });
  await paint(); const afterScroll = await measurements();
  assert(afterScroll.scrollTop > 0, "real supporting content overflow exercised");
  assert(afterScroll.controls.every((control) => control.visible), "title and all primary controls remain visible after supporting scroll");
  assert.deepEqual(afterScroll.controls.map(({ top, bottom }) => ({ top, bottom })), beforeScroll.controls.map(({ top, bottom }) => ({ top, bottom })), "primary coordinates stay fixed while supporting content scrolls");
  await screenshot("01-selected-plan-actions.png");
  await click(".plan-selection-primary button", "Why this context?");
  await until(() => run(() => {
    const details = document.querySelector(".plan-context-guidance");
    return details.open && details.contains(document.activeElement);
  }), "Why this context opens and focuses supporting guidance");
  await click(".plan-context-guidance button", "doctrine · docs/doctrine.md");
  const doctrine = await fs.readFile(path.join(fixture.root, "docs/doctrine.md"), "utf8");
  await until(async () => (await sourceState())?.text === doctrine, "explicit context opens exact real working document");
  await click(".plan-selection-primary button", `Read doc · ${fixture.docPath}`);
  await until(async () => (await sourceState())?.text === fixture.docText, "Read doc opens exact authored document");
  await click(".plan-selection-primary button", `Open source · ${fixture.sourcePath}`);
  await until(async () => (await sourceState())?.text === fixture.sourceText, "Open source opens exact source bytes");
  await focus(".cm-content"); key("End", ["control"]);
  await until(async () => (await sourceState())?.anchor === fixture.sourceText.length, "native end-of-source");
  await wc.insertText("// unsaved plan actions proof");
  await until(async () => (await sourceState())?.text === `${fixture.sourceText}// unsaved plan actions proof`, "dirty source acknowledged");
  const dirty = await sourceState();
  await click(".plan-selection-primary button", `Inspect task · ${selected.taskIds[0]}`);
  await until(async () => (await text(".task-detail:not(.task-document) .task-selected-id")) === selected.taskIds[0], "Inspect task deliberately opens exact task");
  await until(() => has(".task-detail:not(.task-document) .task-attach button:not(:disabled)"), "current Attach action");
  await click(".task-detail:not(.task-document) .task-attach button");
  await until(() => has(".agent-task-proposal"), "ordinary attachment proposal");
  const attach = await run(() => document.querySelector("[data-task-attachment='append']") ? "append" : "attach");
  await click(`[data-task-attachment='${attach}']`);
  await until(() => has(".agent-task-slot"), "attached draft");
  const draftState = () => run(() => ({ text: document.querySelector(".agent-draft textarea")?.value,
    slot: document.querySelector(".agent-task-slot")?.textContent, source: document.querySelector(".agent-context-path")?.textContent }));
  const draft = await draftState();
  stage = "retained-work";
  const cameras = await run(() => { globalThis.__actionsGraphs = [...document.querySelectorAll(".react-flow__viewport")]; return globalThis.__actionsGraphs.map((node) => node.style.transform); });
  await click(".plan-selection-primary button", `Read doc · ${fixture.docPath}`);
  await until(async () => (await sourceState())?.text === fixture.docText, "read doc with retained dirty source");
  await click(".plan-selection-primary button", `Open source · ${fixture.sourcePath}`);
  await until(async () => (await sourceState())?.text === dirty.text, "return to unsaved source");
  assert.deepEqual(await sourceState(), dirty, "dirty source logical cursor retained");
  assert.deepEqual(await draftState(), draft, "draft and attached task retained");
  assert.deepEqual(await run(() => globalThis.__actionsGraphs.map((node) => ({ connected: node.isConnected, transform: node.style.transform }))),
    cameras.map((transform) => ({ connected: true, transform })), "graph component identity and cameras retained");
  assert.equal(await fs.readFile(path.join(fixture.root, fixture.sourcePath), "utf8"), fixture.sourceText, "source disk untouched");
  const agents = await request({ type: "agent.snapshot" });
  assert(agents.ok && agents.agent.snapshot.runs.length === 0 && !agents.agent.snapshot.capabilities.controls.launch);
  await screenshot("02-plan-actions-retained-work.png");
  const diagnostics = classifyRendererDiagnostics(rendererErrors);
  assert.equal(diagnostics.blockingErrors.length, 0, JSON.stringify(rendererErrors));
  await fs.writeFile(path.join(evidence, "actions-proof.json"), JSON.stringify({ ok: true, realDitz: true, packagedCore: true,
    input: "Disposable real Git/Ditz repo with explicitly authored supporting-note layout pressure; not observed live architecture",
    viewport: { width: 1440, height: 876 }, selectedTitle: selected.title, beforeScroll, afterScroll,
    primaryControlsVisibleAfterScroll: true, sourceDraftCamerasRetained: true,
    activated: ["native Enter plan selection", "Why this context focus", "context document", "Read doc", "Open source", "Inspect task", "Attach"],
    modelTurns: 0, rendererErrors, diagnostics, milliseconds: Date.now() - started }));
}
main().catch(async (error) => {
  await fs.writeFile(path.join(evidence, "actions-failure.json"), JSON.stringify({ stage, message: error.stack ?? String(error), rendererErrors }));
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) await fs.writeFile(path.join(evidence, "failure.png"), (await win.webContents.capturePage()).toPNG());
  process.exitCode = 1;
});
