// TEST ONLY: unchanged packaged main/preload/core, actual on-disk Bazel inputs.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_BUILD_GRAPH_EVIDENCE, packaged = process.env.SWARM_BUILD_GRAPH_PACKAGE;
const rendererErrors = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push(event.message); });
  contents.on("render-process-gone", (_event, details) => rendererErrors.push(details.reason));
});
require(path.join(packaged, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 40000) { const deadline = Date.now() + ms; while (Date.now() < deadline) { if (await check()) return; await sleep(50); } throw new Error(`Timed out: ${label}`); }
async function main() {
  const started = Date.now(), fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  await app.whenReady(); await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned X11 selection");
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  assert.equal(app.getPath("userData"), process.env.SWARM_BUILD_GRAPH_PROFILE);
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => { addEventListener("error", (event) => console.error(event.error?.stack ?? event.message)); addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason)); });
  const clickText = (text) => run((text) => { const button = [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === text && !node.disabled); if (!button) throw new Error(`Missing ${text}`); button.click(); }, text);
  const click = (selector) => run((selector) => { const node = document.querySelector(selector); if (!node || node.disabled) throw new Error(`Missing ${selector}`); node.click(); }, selector);
  const request = (input) => run((input) => window.swarm.request({ protocolVersion: 7, requestId: `build-proof:${crypto.randomUUID()}`, ...input }), input);
  await until(() => run(() => !!document.querySelector("[data-topology='repo']")), "registered repository");
  const response = await request({ type: "workspace.snapshot" }); assert(response.ok);
  const { project, world } = response.snapshot;
  const read = async () => { const result = await request({ type: "buildGraph.observe", repositoryId: project.id, worldId: world.id, refresh: false }); assert(result.ok); return result.buildGraph; };
  const current = () => run(() => document.querySelector("[data-build-status]")?.dataset.buildStatus);
  const node = (target) => run((target) => !!document.querySelector(`.build-canvas .react-flow__node[data-id='${target}']`), target);
  const edge = (to) => run((from, to) => !!document.querySelector(`.build-canvas .react-flow__edge[data-id='${from}->${to}']`), fixture.target, to);
  const screenshot = async (name) => fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG());
  await clickText("Build graph"); await until(async () => await current() === "current", "actual Bazel graph current");
  assert(await node(fixture.target)); assert(await node("//b:isolated")); assert(await edge("//b:library"));
  if (fixture.kind === "second") assert(!await node("//a:consumer"), "second repository never borrows first graph");
  const before = await read(); assert.equal(before.repositoryId, project.id); assert.equal(before.graph.repositoryId, project.id);
  await screenshot("01-live-build-graph.png");
  // Ordinary repository/source activation and an unsent, fixed-source draft.
  await click("[aria-label='Enter directory a']"); await until(() => run(() => !!document.querySelector("[aria-label='Open file a/input.txt']")), "source listing");
  await click("[aria-label='Open file a/input.txt']"); await until(() => run(() => !!document.querySelector(".cm-content")), "source editor");
  await run(() => document.querySelector(".cm-content").focus()); await wc.insertText("unsaved ");
  await clickText("Prepare an agent draft"); await until(() => run(() => !!document.querySelector(".agent-draft textarea")), "ordinary draft");
  await run(() => document.querySelector(".agent-draft textarea").focus());
  await until(() => run(() => document.activeElement === document.querySelector(".agent-draft textarea")), "draft focus before native input");
  wc.sendInputEvent({ type: "keyDown", keyCode: "A", modifiers: ["control"] }); wc.sendInputEvent({ type: "keyUp", keyCode: "A", modifiers: ["control"] });
  await wc.insertText("Preserve this unsent draft");
  await until(() => run(() => document.querySelector(".agent-draft textarea").value === "Preserve this unsent draft"), "exact draft input before graph mutation");
  await click(".build-target-controls input[type='checkbox']"); // Disable Follow file to keep isolated rules in the manual graph.
  await run(() => new Promise((done) => setTimeout(done, 500)));
  await run(() => { const source = document.querySelector(".cm-content"), editor = source.cmView.rootView.view;
    globalThis.__buildRetained = { source, text: editor.state.doc.toString(), head: editor.state.selection.main.head, draft: document.querySelector(".agent-draft textarea"),
      build: document.querySelector(".build-canvas .react-flow"), repo: document.querySelector("[data-topology='repo'] .react-flow"),
      camera: document.querySelector(".build-canvas .react-flow__viewport").style.transform, repoCamera: document.querySelector("[data-topology='repo'] .react-flow__viewport").style.transform };
  });
  const retained = () => run(() => { const saved = globalThis.__buildRetained, source = document.querySelector(".cm-content"), editor = source.cmView.rootView.view;
    return { source: saved.source === source, text: saved.text === editor.state.doc.toString(), cursor: saved.head === editor.state.selection.main.head,
      draft: saved.draft === document.querySelector(".agent-draft textarea"), draftText: document.querySelector(".agent-draft textarea").value === "Preserve this unsent draft",
      build: saved.build === document.querySelector(".build-canvas .react-flow"), repo: saved.repo === document.querySelector("[data-topology='repo'] .react-flow"),
      camera: saved.camera === document.querySelector(".build-canvas .react-flow__viewport").style.transform,
      repoCamera: saved.repoCamera === document.querySelector("[data-topology='repo'] .react-flow__viewport").style.transform };
  });
  await fs.writeFile(path.join(fixture.root, "a/BUILD"), fixture.removedDefinition);
  await until(async () => await current() === "refreshing", "observed definition dirtiness");
  assert(await edge("//b:library"), "last consistent edge retained during refresh");
  await screenshot("02-retained-refreshing.png");
  await until(async () => await current() === "current" && !await edge("//b:library"), "actual removed edge");
  const removed = await read(); assert.notEqual(removed.graph.inputDigest, before.graph.inputDigest);
  const retention = await retained(); assert(Object.values(retention).every(Boolean), JSON.stringify(retention));
  await clickText("Service"); await fs.writeFile(path.join(fixture.root, "a/BUILD"), fixture.addedDefinition);
  await clickText("Build graph"); await until(async () => await current() === "current" && await edge("//b:isolated") && await edge("//b:library"), "reactivation actual added edges");
  await clickText("Refresh build graph"); await until(async () => await current() === "refreshing", "explicit refresh");
  await until(async () => await current() === "current", "explicit refreshed current");
  const after = await read(); assert.notEqual(after.graph.inputDigest, removed.graph.inputDigest);
  const finalRetention = await retained(); assert(Object.values(finalRetention).every(Boolean), JSON.stringify(finalRetention));
  await screenshot("03-added-edges-retained-work.png");
  const agents = await request({ type: "agent.snapshot" }); assert(agents.ok && agents.agent.snapshot.runs.length === 0 && !agents.agent.snapshot.capabilities.controls.launch);
  assert.deepEqual(rendererErrors, []);
  await fs.writeFile(path.join(evidence, "build-graph-proof.json"), JSON.stringify({ ok: true, case: fixture.kind, elapsedMs: Date.now() - started, realBazel: true, packagedCore: true, modelTurns: 0, repositoryId: project.id, before, removed, after, retention, finalRetention, rendererErrors }));
}
main().catch(async (error) => {
  const contents = BrowserWindow.getAllWindows()[0]?.webContents;
  const diagnostics = contents ? await contents.executeJavaScript(`({status: document.querySelector('[data-build-status]')?.textContent, body: document.body.innerText.slice(0,12000)})`).catch(() => null) : null;
  await fs.writeFile(path.join(evidence, "build-graph-failure.json"), JSON.stringify({ error: error.stack, rendererErrors, diagnostics }));
});
