// TEST ONLY: unchanged packaged main/preload/core, ordinary native UI controls.
// The launcher's disposable fixture is not a production fixture provider.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const evidence = process.env.SWARM_PLANS_EVIDENCE, packaged = process.env.SWARM_PLANS_PACKAGE;
const rendererErrors = []; let stage = "startup";
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push({ stage, message: event.message.slice(0, 4096) }); });
  contents.on("render-process-gone", (_event, details) => rendererErrors.push({ stage, message: `Renderer gone: ${details.reason}` }));
});
require(path.join(packaged, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await sleep(40); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now(), fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  assert.equal(path.dirname(fixture.root), process.env.SWARM_PLANS_SCRATCH);
  assert.equal(await fs.realpath(fixture.root), fixture.root);
  const indexPath = path.join(fixture.root, ".swarm/plans.json"), originalIndex = await fs.readFile(indexPath);
  await app.whenReady(); assert.equal(app.getPath("userData"), process.env.SWARM_PLANS_PROFILE);
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned native window", 30000);
  const win = BrowserWindow.getAllWindows()[0]; assert(win && !win.isDestroyed());
  const wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => {
    addEventListener("error", (event) => console.error(event.error?.stack ?? event.message));
    addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason));
  });
  const label = (value) => `[aria-label=${JSON.stringify(value)}]`;
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const request = (body) => run((input) => window.swarm.request({ protocolVersion: 7, requestId: `plans-proof:${crypto.randomUUID()}`, ...input }), body);
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
    wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...coordinates });
    await paint();
  };
  const key = (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    if (keyCode === "Enter") wc.sendInputEvent({ type: "char", keyCode: "\r", modifiers });
    wc.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  };
  const focus = (selector) => run((s) => { const node = document.querySelector(s); if (!node) throw new Error(`Missing ${s}`); node.scrollIntoView({ block: "nearest" }); node.focus(); }, selector);
  const screenshot = async (name) => { await paint(); await fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG()); };
  const taskGraph = label("Task dependency graph"), planGraph = label("Authored plan hierarchy");
  win.focus(); wc.focus();
  await until(() => has("[data-task-status='observed']"), "real Ditz observation");
  const world = await request({ type: "workspace.snapshot" }); assert(world.ok);
  assert.equal(world.snapshot.project.name, path.basename(fixture.root));
  assert(wc.getURL().startsWith(pathToFileURL(path.join(packaged, "renderer/index.html")).href));
  const taskSnapshot = await request({ type: "tasks.snapshot", worldId: world.snapshot.world.id, refresh: false });
  assert(taskSnapshot.ok && taskSnapshot.task.observation.snapshot.metadataCommit.hex === fixture.metadataCommit);
  stage = "real-blockage";
  await click(".lens-tabs button", "Plan"); await click(`${taskGraph} button`, "Load dependency graph");
  await until(async () => (await text(`${taskGraph} .planning-status`)).includes("0 unread"), "all real task details loaded");
  assert(await run(() => {
    const system = document.querySelector(".graphs-grid").getBoundingClientRect(), plans = document.querySelector(".planning-field").getBoundingClientRect();
    return Math.abs(system.left - plans.left) < 2 && Math.abs(system.width - plans.width) < 2;
  }), "no-document System/Plan share one full navigation column");
  assert(await run(() => {
    const system = document.querySelector(".graphs-grid");
    return system.inert && getComputedStyle(system).opacity === "0";
  }), "measurable inactive System is inert and fully transparent even for explicitly visible Flow nodes");
  const initialSystem = await run(() => [...document.querySelectorAll(".graphs-grid .react-flow__viewport")].map((node) => node.style.transform));
  await click(".lens-tabs button", "System"); await click(".lens-tabs button", "Plan");
  assert.deepEqual(await run(() => [...document.querySelectorAll(".graphs-grid .react-flow__viewport")].map((node) => node.style.transform)), initialSystem,
    "no-document lens switch retains System cameras");
  const graphNodes = await run((scope) => [...document.querySelectorAll(`${scope} .react-flow__node`)].map((node) => node.dataset.id), taskGraph);
  assert(graphNodes.includes("graph-isolated"));
  const graphEdges = await run((scope) => [...document.querySelectorAll(`${scope} .react-flow__edge`)].map((edge) => edge.dataset.id), taskGraph);
  for (const pair of [["graph-root", "graph-left"], ["graph-root", "graph-right"], ["graph-left", "graph-join"], ["graph-right", "graph-join"]])
    assert(graphEdges.includes(JSON.stringify(pair)), `actual directed edge ${pair}`);
  await screenshot("01-task-blockage.png");
  await click(`${taskGraph} .planning-inspector summary`, `Keyboard task outline · ${graphNodes.length} shown`);
  await focus(label("Open graph task graph-root")); key("Enter");
  await until(async () => (await text(".task-detail:not(.task-document) .task-selected-id")) === "graph-root", "pinned task opened by keyboard");
  assert((await text(".task-detail:not(.task-document)")).includes(fixture.metadataCommit));
  await click(label(`Reveal working file ${fixture.sourcePath} at line 1`));
  await until(() => has(".cm-content"), "real source editor");
  const sourceState = () => run(() => { const state = document.querySelector(".cm-content")?.cmView?.rootView?.view?.state;
    return state ? { text: state.doc.toString(), anchor: state.selection.main.anchor, head: state.selection.main.head } : null; });
  await until(async () => (await sourceState())?.text === fixture.sourceText, "exact actual source bytes");
  await focus(".cm-content"); key("End", ["control"]);
  await until(async () => (await sourceState())?.anchor === fixture.sourceText.length, "native end of source acknowledged");
  await wc.insertText("// unsaved planning proof");
  await until(async () => (await sourceState())?.text === `${fixture.sourceText}// unsaved planning proof`, "native dirty source input");
  const dirty = await sourceState();
  await click(label("Open graph task graph-root"));
  await until(async () => await has(".task-detail:not(.task-document) .task-attach button:not(:disabled)"), "current task Attach");
  await click(".task-detail:not(.task-document) .task-attach button");
  await until(() => has(".agent-task-proposal"), "ordinary attachment review");
  const attach = await run(() => document.querySelector("[data-task-attachment='append']") ? "append" : "attach");
  await click(`[data-task-attachment='${attach}']`);
  await until(() => has(".agent-task-slot"), "one attached task slot");
  const draftState = () => run(() => {
    const slot = document.querySelector(".agent-task-slot");
    const retainedMessage = "Retained preview; not confirmed in this connection. Refresh tasks and inspect the pin. Core always verifies independently.";
    const retained = [...slot.querySelectorAll("p")].filter((node) => node.textContent === retainedMessage);
    const content = slot.cloneNode(true);
    // This one existing freshness notice is not immutable task content. Retain
    // and compare every other byte; separately assert its expected appearance.
    for (const node of content.querySelectorAll("p")) if (node.textContent === retainedMessage) node.remove();
    return { payload: { text: document.querySelector(".agent-draft textarea")?.value, slot: content.textContent,
      source: document.querySelector(".agent-draft .agent-context-path")?.textContent }, retainedNotices: retained.length };
  });
  const draft = await draftState();
  assert.equal(draft.retainedNotices, 0, "new attachment is currently inspected at its exact pin");
  stage = "authored-hierarchy";
  await click(".planning-tabs button", "Plans & components"); await click(`${planGraph} button`, "Load plan index");
  await until(async () => (await text(`${planGraph} .planning-status`)).includes(`${fixture.index.nodes.length} authored nodes`), "actual plan index read");
  const observed = await request({ type: "plans.read", worldId: world.snapshot.world.id, repositoryId: world.snapshot.project.id });
  assert(observed.ok && observed.plans.status === "observed"); assert.deepEqual(observed.plans.index, fixture.index);
  assert.equal(observed.plans.revision, createHash("sha256").update(originalIndex).digest("hex"));
  const rootPlan = fixture.index.nodes.find((node) => node.parentId === null);
  const component = fixture.index.nodes.find((node) => node.parentId === rootPlan.id);
  assert(fixture.index.nodes.some((node) => node.parentId === component.id), "three authored levels");
  await click(label(`Inspect plan ${rootPlan.id}`));
  await screenshot("02-authored-plans.png");
  await click(`${planGraph} button`, `Read doc · ${fixture.docPath}`);
  await until(async () => (await sourceState())?.text === fixture.docText, "plan opens exact document through broker");
  const sourcePlan = fixture.index.nodes.find((node) => node.sourcePaths.includes(fixture.sourcePath));
  await focus(`${planGraph} .react-flow__node[data-id="${sourcePlan.id}"]`); key("Enter");
  await until(async () => (await text(`${planGraph} .planning-inspector code`)).startsWith(sourcePlan.id), "native plan node Enter changes inspector");
  await click(`${planGraph} button`, `Open source · ${fixture.sourcePath}`);
  await until(async () => (await sourceState())?.text === dirty.text, "plan source activation retains dirty buffer");
  assert.deepEqual(await sourceState(), dirty, "source logical cursor retained");
  const linked = fixture.index.nodes.find((node) => node.taskIds.length);
  await click(label(`Inspect plan ${linked.id}`)); await click(`${planGraph} button`, `Inspect task · ${linked.taskIds[0]}`);
  await until(async () => (await text(".task-detail:not(.task-document) .task-selected-id")) === linked.taskIds[0], "authored task link deliberately activated");
  const refs = fixture.index.nodes.find((node) => node.contextRefs.length);
  await click(label(`Inspect plan ${refs.id}`));
  assert((await text(`${planGraph} .planning-inspector`)).includes("Why this context?"));
  await screenshot("03-linked-context.png");
  stage = "camera-retention";
  await click(`${planGraph} .react-flow__controls-zoomin`); await sleep(250); await paint();
  const before = await run(() => {
    globalThis.__plansProofNodes = [...document.querySelectorAll(".react-flow__viewport")];
    return globalThis.__plansProofNodes.map((node) => node.style.transform);
  });
  await click(".planning-tabs button", "Task blockage"); await click(".lens-tabs button", "System"); await click(".lens-tabs button", "Plan");
  await click(".planning-tabs button", "Plans & components"); await paint();
  assert.deepEqual(await run(() => globalThis.__plansProofNodes.map((node) => ({ connected: node.isConnected, transform: node.style.transform }))),
    before.map((transform) => ({ connected: true, transform })), "all independent graph instances/cameras retained");
  assert.deepEqual(await sourceState(), dirty);
  const retainedDraft = await draftState();
  assert.deepEqual(retainedDraft.payload, draft.payload, "all draft, source and attachment content retained");
  assert.equal(retainedDraft.retainedNotices, Number(linked.taskIds[0] !== "graph-root"), "freshness honestly follows currently inspected task, not attachment mutation");
  stage = "negative-index";
  await fs.writeFile(indexPath, "{broken authored index");
  await click(`${planGraph} button`, "Load plan index");
  await until(async () => (await text(`${planGraph} .planning-status`)).includes("PLAN_INDEX_MALFORMED"), "malformed index unavailable");
  assert.equal(await has(`${planGraph} .react-flow__node`), false, "no mock fallback");
  await fs.rename(indexPath, `${indexPath}.held-proof`);
  await click(`${planGraph} button`, "Load plan index");
  await until(async () => (await text(`${planGraph} .planning-status`)).includes("PLAN_INDEX_UNAVAILABLE"), "missing index unavailable");
  await fs.rename(`${indexPath}.held-proof`, indexPath); await fs.writeFile(indexPath, originalIndex);
  await click(`${planGraph} button`, "Load plan index");
  await until(async () => (await text(`${planGraph} .planning-status`)).includes("authored nodes"), "explicit plan recovery");
  stage = "bounded-coverage";
  // Positive over-capacity data is also authored by the real CLI, not renderer
  // injection. Keep it after the legible five-task screenshot and normal tour.
  const fixtureHome = path.join(fixture.root, ".fixture-home");
  for (let i = 0; i < 65; i++) execFileSync(fixture.ditzExecutable, ["add", `Coverage task ${i}`, "--id", `zz-coverage-${String(i).padStart(3, "0")}`,
    "--type", "task", "--desc", "CLI-authored bounded-coverage demonstration input."], { cwd: fixture.root, timeout: 5000, maxBuffer: 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: fixtureHome, XDG_CONFIG_HOME: fixtureHome, LANG: "C", LC_ALL: "C", USER: "Fixture", LOGNAME: "Fixture",
      GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: "Plans fixture",
      GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Plans fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" } });
  await click(".planning-tabs button", "Task blockage"); await click(`${taskGraph} button`, "Refresh task metadata");
  const totalTasks = taskSnapshot.task.observation.snapshot.summaries.length + 65;
  await until(async () => {
    const current = await request({ type: "tasks.snapshot", worldId: world.snapshot.world.id, refresh: false });
    return current.ok && current.task.observation.snapshot?.summaries.length === totalTasks;
  }, "real CLI over-capacity metadata observed");
  await click(`${taskGraph} button`, "Load dependency graph");
  await until(async () => (await text(`${taskGraph} .planning-status`)).includes(`64/${totalTasks} details read · ${totalTasks - 64} unread`), "bounded partial graph reports full snapshot denominator");
  assert((await text(`${taskGraph} .planning-status`)).includes("No known blockers is not permission to dispatch."));
  assert.deepEqual(await sourceState(), dirty); assert.deepEqual((await draftState()).payload, draft.payload);
  await screenshot("05-bounded-coverage.png");
  stage = "negative-task-metadata";
  const git = (args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: fixture.root, encoding: "utf8", timeout: 5000,
    env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }).trim();
  const expandedMetadataCommit = git(["rev-parse", "refs/heads/ditz-metadata"]);
  assert.notEqual(expandedMetadataCommit, fixture.metadataCommit, "real CLI coverage input advanced metadata");
  git(["update-ref", "-d", "refs/heads/ditz-metadata"]); // Explicit owned test fault, not CLI-authored positive metadata.
  await click(`${taskGraph} button`, "Refresh task metadata");
  await until(async () => (await text(`${taskGraph} .planning-status`)).includes("NOT CURRENT"), "retained graph truth after metadata removal");
  assert.equal(await run((selector) => document.querySelector(selector).disabled, label("Open graph task graph-root")), true);
  git(["update-ref", "refs/heads/ditz-metadata", expandedMetadataCommit]);
  await click(`${taskGraph} button`, "Refresh task metadata");
  await until(() => has("[data-task-status='observed']"), "metadata restored by explicit refresh");
  assert.equal(await fs.readFile(path.join(fixture.root, fixture.sourcePath), "utf8"), fixture.sourceText, "source disk unchanged");
  const agents = await request({ type: "agent.snapshot" });
  assert(agents.ok && agents.agent.snapshot.runs.length === 0 && !agents.agent.snapshot.capabilities.controls.launch);
  assert.equal(rendererErrors.length, 0, JSON.stringify(rendererErrors));
  await screenshot("04-retained-work.png");
  await fs.writeFile(path.join(evidence, "plans-proof.json"), JSON.stringify({ ok: true, realDitz: true, packagedCore: true,
    kind: fixture.kind, archivedSourceCommit: fixture.archivedSourceCommit, metadataCommit: fixture.metadataCommit,
    planHash: observed.plans.revision, planNodes: fixture.index.nodes.length, taskNodes: graphNodes.length, directedEdges: graphEdges,
    boundedCoverage: { metadataCommit: expandedMetadataCommit, loaded: 64, total: totalTasks, unread: totalTasks - 64, realDitz: true },
    taskActivation: "native Enter / pinned metadata", sourceDraftCamerasRetained: true, malformedMissingUnavailable: true,
    fixtureFaults: ["malformed/missing owned plan index", "removed/restored owned metadata ref"], modelTurns: 0, rendererErrors, milliseconds: Date.now() - started }));
}
main().catch(async (error) => {
  const win = BrowserWindow.getAllWindows()[0];
  const sourceState = win && !win.isDestroyed() ? await win.webContents.executeJavaScript(`(() => {
    const state = document.querySelector('.cm-content')?.cmView?.rootView?.view?.state;
    return state ? { text: state.doc.toString(), anchor: state.selection.main.anchor, head: state.selection.main.head, focus: document.activeElement?.className } : null;
  })()`).catch(() => null) : null;
  await fs.writeFile(path.join(evidence, "plans-failure.json"), JSON.stringify({ stage, message: error.stack ?? String(error), rendererErrors, sourceState }));
  if (win && !win.isDestroyed()) await fs.writeFile(path.join(evidence, "failure.png"), (await win.webContents.capturePage()).toPNG());
  process.exitCode = 1;
});
