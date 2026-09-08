// Test driver, never included in the product. Reads actual packaged core snapshots.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_SERVICE_EVIDENCE;
const rendererErrors = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push(event.message); });
  contents.on("render-process-gone", (_event, details) => rendererErrors.push(details.reason));
});
require(path.join(process.env.SWARM_SERVICE_PACKAGE, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) { const deadline = Date.now() + ms; while (Date.now() < deadline) { if (await check()) return; await sleep(50); } throw new Error(`Timed out: ${label}`); }
async function main() {
  const started = Date.now();
  await app.whenReady();
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned X11 selection");
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const snapshot = () => run(async () => {
    const response = await window.swarm.request({ protocolVersion: 7, type: "workspace.snapshot", requestId: `service-proof-${crypto.randomUUID()}` });
    if (!response.ok) throw new Error(response.error.message);
    return response.snapshot;
  });
  await until(async () => (await snapshot())?.serviceDeclarations?.services.length === 2, "automatic Compose discovery");
  const initial = await snapshot();
  assert.deepEqual(initial.serviceDeclarations.services.map((entry) => entry.displayName), ["frontend", "backend"]);
  assert.equal(initial.revisions.built.id, ""); assert.equal(initial.jobs.length, 0);
  assert.equal(initial.graphs.find((graph) => graph.topologyId === "service").edges[0].kind, "starts-after");
  await until(() => run(() => !!document.querySelector("[data-topology='service'] .react-flow__node")), "rendered service graph");
  await run(() => {
    const node = [...document.querySelectorAll("[data-topology='service'] .react-flow__node")].find((entry) => entry.textContent.includes("frontend"));
    node.click();
  });
  await until(() => run(() => document.querySelector(".cm-content")?.textContent.includes("local/frontend")), "declaration activation");
  await run(() => document.querySelector("[aria-label='Open file README.md']").click());
  await until(() => run(() => document.querySelector(".cm-content")?.textContent.includes("Independent service project")), "source editor");
  await run(() => document.querySelector(".cm-content").focus()); await wc.insertText("unsaved note ");
  await run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await run(() => { const source = document.querySelector(".cm-content"), view = source.cmView.rootView.view;
    globalThis.__serviceRetained = { source, text: view.state.doc.toString(), cursor: view.state.selection.main.head,
      camera: document.querySelector("[data-topology='service'] .react-flow__viewport").style.transform }; });
  await fs.writeFile(path.join(process.env.SWARM_SERVICE_FIXTURE, "compose.yaml"), "services:\n  frontend:\n    image: local/frontend\n  cache:\n    image: local/cache\n");
  await until(async () => (await snapshot()).serviceDeclarations?.services.some((entry) => entry.displayName === "cache"), "automatic declaration edit");
  const current = await snapshot();
  assert.equal(current.revisions.built.id, ""); assert.equal(current.jobs.length, 0);
  assert.equal(current.graphs.find((graph) => graph.topologyId === "service").edges.length, 0);
  const retained = await run(() => { const old = globalThis.__serviceRetained, source = document.querySelector(".cm-content"), view = source.cmView.rootView.view;
    return { source: source === old.source, text: view.state.doc.toString() === old.text, cursor: view.state.selection.main.head === old.cursor,
      camera: document.querySelector("[data-topology='service'] .react-flow__viewport").style.transform === old.camera }; });
  assert(Object.values(retained).every(Boolean), JSON.stringify(retained));
  await fs.writeFile(path.join(evidence, "declared-services.png"), (await wc.capturePage()).toPNG());
  assert.deepEqual(rendererErrors, []);
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, packagedCore: true, noBuildOrContainer: true,
    before: initial.serviceDeclarations, after: current.serviceDeclarations, retained, rendererErrors, elapsedMs: Date.now() - started }, null, 2));
}
main().catch(async (error) => { await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ error: error.stack, rendererErrors }, null, 2)); });
