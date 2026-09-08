// TEST ONLY: actual packaged application and real Bazel target, owned virtual UI.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_BUILD_GRAPH_EVIDENCE;
const rendererErrors = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push(event.message); });
  contents.on("render-process-gone", (_event, details) => rendererErrors.push(details.reason));
});
require(path.join(process.env.SWARM_BUILD_GRAPH_PACKAGE, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 40000) { const deadline = Date.now() + ms; while (Date.now() < deadline) { if (await check()) return; await sleep(50); } throw new Error(`Timed out: ${label}`); }
async function main() {
  const started = Date.now();
  const fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  await app.whenReady();
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned X11 selection");
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => { addEventListener("error", (event) => console.error(event.error?.stack ?? event.message)); addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason)); });
  const clickText = (text) => run((text) => {
    const node = [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === text && !item.disabled && item.getClientRects().length);
    if (!node) throw new Error(`Missing ${text}`); node.click();
  }, text);
  const click = (selector) => run((selector) => { const node = document.querySelector(selector); if (!node || node.disabled) throw new Error(`Missing ${selector}`); node.click(); }, selector);
  await until(() => run(() => !!document.querySelector("[data-topology='repo']")), "repository");
  await clickText("Build graph");
  await until(() => run(() => document.querySelector("[data-build-status]")?.dataset.buildStatus === "current"), "real dependencies");
  await click("[aria-label='Enter directory a']");
  await until(() => run(() => !!document.querySelector("[aria-label='Open file a/input.txt']")), "file entry");
  await click("[aria-label='Open file a/input.txt']");
  await until(() => run(() => !!document.querySelector(".cm-content")), "editor");
  await run(() => document.querySelector(".cm-content").focus()); await wc.insertText("unsaved build proof ");
  await until(() => run(() => document.querySelector(".cm-content")?.textContent.includes("unsaved build proof")), "native editor input");
  await run((target) => { const node = document.querySelector(`.build-canvas .react-flow__node[data-id='${target}']`); if (!node) throw new Error("Missing selected rule"); node.click(); }, fixture.target);
  await run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await run(() => { const node = document.querySelector(".cm-content"), editor = node.cmView.rootView.view;
    globalThis.__targetRetained = { node, text: editor.state.doc.toString(), cursor: editor.state.selection.main.head,
      build: document.querySelector(".build-canvas .react-flow"), camera: document.querySelector(".build-canvas .react-flow__viewport").style.transform }; });
  await clickText("Build selected target");
  await until(() => run((target) => [...document.querySelectorAll("[data-target-build-id]")].some((node) => node.textContent.includes(target) && node.textContent.includes("Complete")), fixture.target), "actual build completion");
  const retained = await run(() => { const saved = globalThis.__targetRetained, node = document.querySelector(".cm-content"), editor = node.cmView.rootView.view;
    return { source: node === saved.node, text: editor.state.doc.toString() === saved.text, cursor: editor.state.selection.main.head === saved.cursor,
      graph: document.querySelector(".build-canvas .react-flow") === saved.build, camera: document.querySelector(".build-canvas .react-flow__viewport").style.transform === saved.camera }; });
  assert(Object.values(retained).every(Boolean), JSON.stringify(retained));
  // Refresh query is a different action and must not rebuild or remove the row.
  const jobId = await run(() => document.querySelector("[data-target-build-id]").dataset.targetBuildId);
  await clickText("Refresh dependencies");
  await until(() => run(() => document.querySelector("[data-build-status]")?.dataset.buildStatus === "refreshing"), "refresh acknowledged");
  await until(() => run(() => document.querySelector("[data-build-status]")?.dataset.buildStatus === "current"), "refreshed dependencies");
  assert.equal(await run(() => document.querySelector("[data-target-build-id]").dataset.targetBuildId), jobId);
  assert.equal(await run(() => document.querySelectorAll("[data-target-build-id]").length), 1);
  await fs.writeFile(path.join(evidence, "selected-target-build.png"), (await wc.capturePage()).toPNG());
  assert.deepEqual(rendererErrors, []);
  await fs.writeFile(path.join(evidence, "build-graph-proof.json"), JSON.stringify({ ok: true, case: "selected-target", realBazel: true, packagedCore: true,
    target: fixture.target, retainedThroughBuild: retained, jobId, dependencyRefreshDidNotBuild: true, modelTurns: 0, rendererErrors, elapsedMs: Date.now() - started }, null, 2));
}
main().catch(async (error) => { await fs.writeFile(path.join(evidence, "build-graph-failure.json"), JSON.stringify({ error: error.stack, rendererErrors }, null, 2)); });
