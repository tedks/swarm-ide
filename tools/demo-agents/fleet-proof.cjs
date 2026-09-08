// Test-only driver around the unchanged packaged production composition.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_ARTIFACT_DIR, errors = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") errors.push(event.message); });
  contents.on("render-process-gone", (_event, info) => errors.push(info.reason));
});
require(path.join(process.env.SWARM_FLEET_PACKAGE, "app/electron/main.js"));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(fn, label) { const deadline = Date.now() + 30000; while (!await fn()) { if (Date.now() > deadline) throw new Error(`Timed out ${label}`); await delay(50); } }
async function main() {
  await app.whenReady();
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned selection");
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await until(() => run(() => document.querySelectorAll("[aria-label='Fork lineage'] li").length >= 3), "real fleet roster");
  const response = await run(async () => window.swarm.request({ protocolVersion: 7, requestId: `fleet-proof:${crypto.randomUUID()}`, type: "externalAgents.snapshot" }));
  assert(response.ok && response.external.kind === "snapshot");
  const fleet = response.external.snapshot.fleet, root = fleet.find((d) => d.session.id === "01a0702a-7b5e-71e0-bb62-287d55a7f9ba");
  assert(root && root.session.evidence === "local" && root.entries.length > 0);
  const children = fleet.filter((d) => d.session.parentId === root.session.id && d.session.control === "tmux" && d.session.worktree && d.entries.some((e) => e.command || e.path));
  assert(children.length >= 2, "two actual worker tails with parsed tool events");
  for (const child of children.slice(0, 2)) assert.equal(await run((id) => document.querySelector(`[aria-label='Fork lineage'] [data-session='${id}']`)?.dataset.depth, child.session.id), "1");
  await until(() => run(() => document.querySelectorAll(".observed-activity [data-event]").length > 0), "unselected live activity");
  assert.equal(await run(() => document.querySelectorAll("[aria-label='Fork lineage'] button[aria-pressed='true']").length), 0);
  const shown = await run(() => [...document.querySelectorAll(".observed-activity [data-event]")].map((row) => ({ sessionId: row.dataset.session, eventId: row.dataset.event, text: row.textContent })));
  assert(shown.every((row) => fleet.find((d) => d.session.id === row.sessionId)), "UI rows belong to real registered sessions");
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(evidence, "fleet-proof.json"), JSON.stringify({ real: true, modelTurns: 0, root: root.session.id, workers: children.map((d) => ({ id: d.session.id, worktree: d.session.worktree, entries: d.entries.length })), visibleEvents: shown, rendererErrors: errors }));
  await until(() => fs.access(path.join(evidence, "close-request")).then(() => true, () => false), "capture");
  app.quit();
}
main().catch(async (error) => { await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ message: error.stack, errors })); app.exit(1); });
