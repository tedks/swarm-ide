// Read-only real registered sessions and a copy of the operator's saved outcomes.
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
  await until(() => run(() => document.querySelectorAll("[aria-label='Fork lineage'] li").length > 0), "registered agents");
  const snapshot = await run(async () => {
    const result = await window.swarm.request({ protocolVersion: 7, requestId: crypto.randomUUID(), type: "externalAgents.snapshot" });
    if (!result.ok) throw new Error("Snapshot failed");
    return result.external.snapshot;
  });
  const root = snapshot.sessions.find((s) => s.id === "01a0702a-7b5e-71e0-bb62-287d55a7f9ba");
  const historical = snapshot.sessions.find((s) => s.label.startsWith("H7 "));
  assert(root?.lifecycle, "Actual ROOT lifecycle is published through the packaged bridge");
  assert.equal(historical?.lifecycle?.state, "completed", "Actual H7 completed turn remains published");
  await run(() => { const older = document.querySelector(".external-older-toggle"); if (older?.getAttribute("aria-expanded") === "false") older.click(); });
  await until(() => run((id) => document.querySelector(`[data-session='${id}'] [data-run-state]`)?.dataset.runState === "completed", historical.id), "H7 Complete rail badge");
  await until(() => run((id) => Boolean(document.querySelector(`[data-session='${id}'] .external-agent-outcome-text`)?.textContent), historical.id), "saved H7 summary");
  const before = await run((id) => {
    const row = document.querySelector(`[data-session='${id}']`);
    return { text: row.querySelector(".external-agent-outcome-text").textContent, lines: getComputedStyle(row.querySelector(".external-agent-outcome-text")).webkitLineClamp };
  }, historical.id);
  assert.equal(before.lines, "1");
  await run((id) => {
    const button = document.querySelector(`[data-session='${id}'] button[aria-pressed]`);
    button.scrollIntoView({ block: "center" }); button.focus(); button.click();
  }, historical.id);
  await until(() => run((id) => document.querySelector(`[data-session='${id}'] button[aria-pressed]`)?.getAttribute("aria-pressed") === "true", historical.id), "agent conversation selection");
  const after = await run((id) => {
    const row = document.querySelector(`[data-session='${id}']`);
    return { text: row.querySelector(".external-agent-outcome-text").textContent,
      lines: getComputedStyle(row.querySelector(".external-agent-outcome-text")).webkitLineClamp,
      at: row.querySelector(".external-agent-outcome time")?.dateTime,
      panels: document.querySelectorAll(".dock-work-log .work-log-panel").length };
  }, historical.id);
  assert.equal(after.text, before.text); assert.equal(after.lines, "3"); assert(after.at); assert.equal(after.panels, 1);
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(evidence, "fleet-proof.json"), JSON.stringify({ realRegisteredSessions: true, copiedSavedOutcomes: true,
    root: { id: root.id, lifecycle: root.lifecycle }, historical: { id: historical.id, lifecycle: historical.lifecycle, outcomeAt: after.at },
    summaryUnchangedOnSelection: true, collapsedLines: before.lines, expandedLines: after.lines,
    singleWorkLogPanel: true, driverModelActions: 0, rendererErrors: errors }));
  await until(() => fs.access(path.join(evidence, "close-request")).then(() => true, () => false), "capture");
  app.quit();
}
main().catch(async (error) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) await fs.writeFile(path.join(evidence, "failure.png"), (await win.capturePage()).toPNG());
  await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ message: error.stack, errors })); app.exit(1);
});
