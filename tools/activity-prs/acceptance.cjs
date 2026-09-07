// Test driver only: unchanged packaged production main/preload/core, actual gh.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const evidence = process.env.SWARM_ACTIVITY_EVIDENCE, errors = [], requests = [], failures = [];
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, async (event, input) => { if (channel === "swarm:request") requests.push(input.type); const result = await listener(event, input); if (channel === "swarm:request" && !result.response.ok) failures.push({ type: input.type, code: result.response.error.code }); return result; });
app.on("web-contents-created", (_event, wc) => wc.on("console-message", (event) => { if (event.level === "error") errors.push(event.message); }));
require(path.join(process.env.SWARM_ACTIVITY_PACKAGE, "app/electron/main.js"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) { const end = Date.now() + ms; while (Date.now() < end) { if (await check()) return; await delay(40); } throw new Error(`Timed out: ${label}`); }
async function main() {
  const start = Date.now(); await app.whenReady();
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window selection", 30000);
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => { addEventListener("error", (event) => console.error(event.error?.stack ?? event.message)); addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason)); });
  const click = async (selector) => {
    const p = await run((s) => {
      const node = document.querySelector(s); if (!node || node.disabled) throw new Error(`Missing ${s}`);
      node.scrollIntoView({ block: "nearest" }); const r = node.getBoundingClientRect();
      let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
      }
      const x = (left + right) / 2, y = (top + bottom) / 2;
      if (right <= left || bottom <= top || !node.contains(document.elementFromPoint(x, y))) throw new Error(`Occluded ${s}`);
      return { x: Math.round(x), y: Math.round(y) };
    }, selector);
    wc.sendInputEvent({ type: "mouseDown", ...p, button: "left", clickCount: 1 }); wc.sendInputEvent({ type: "mouseUp", ...p, button: "left", clickCount: 1 }); await delay(60);
  };
  await until(() => run(() => Boolean(document.querySelector(".activity-open-heading"))), "Recent Activity heading");
  assert(!requests.includes("githubPrs.refresh"), "No automatic GitHub request");
  await click(".activity-open-heading");
  await until(() => run(() => !document.querySelector(".journal-panel").hidden), "central Activity log");
  assert.equal(await run(() => document.querySelector(".journal-header h2").textContent), "Activity log");
  assert(!(await run(() => document.querySelector(".journal-panel").textContent)).includes("The work, reconstructed"));
  await fs.writeFile(path.join(evidence, "00-readable-activity.png"), (await wc.capturePage()).toPNG());
  await click('.journal-view-tabs button:last-child');
  await click('[aria-label="Refresh pull requests"]');
  await until(() => run(() => Boolean(document.querySelector(".github-prs li")) || Boolean(document.querySelector(".github-pr-notice"))), "actual GitHub response");
  const notice = await run(() => document.querySelector(".github-pr-notice")?.textContent ?? "");
  assert.equal(notice, "", `Actual GitHub boundary: ${notice}`);
  const prs = await run(() => [...document.querySelectorAll(".github-prs li")].map((node) => node.textContent));
  assert(prs.length > 0 && prs.length <= 20);
  await fs.writeFile(path.join(evidence, "01-github-activity.png"), (await wc.capturePage()).toPNG());
  // Choose only a real returned changed path which actually exists in this clone.
  const paths = await run(() => [...document.querySelectorAll(".github-prs .journal-paths button")].map((node) => node.textContent.replace("Open working file · ", "")));
  let chosen;
  for (const candidate of paths) { try { const file = await fs.lstat(path.join(process.env.SWARM_ACTIVITY_ROOT, candidate)); if (file.isFile() && file.size < 20000) { chosen = candidate; break; } } catch {} }
  assert(chosen, "At least one returned PR path exists in this real clone");
  await run((chosen) => { const button = [...document.querySelectorAll(".github-prs .journal-paths button")].find((node) => node.textContent === `Open working file · ${chosen}`); button.closest("details").open = true; button.dataset.proofChosen = "true"; }, chosen);
  await click('[data-proof-chosen="true"]');
  await until(() => run(() => Boolean(document.querySelector(".source-surface:not([hidden]) .cm-content"))), "PR path opens actual source");
  await click(".source-surface:not([hidden]) .cm-content"); await wc.insertText("\n// owned Activity proof draft\n");
  await click(".agent-dock-welcome .agent-primary");
  await until(() => run(() => Boolean(document.querySelector(".agent-draft textarea"))), "unlaunched draft");
  await click(".agent-draft textarea"); await wc.insertText("Retain my unlaunched J2 instructions.");
  await delay(400);
  const retained = await run(() => { globalThis.__activityRetained = { source: document.querySelector(".cm-content"), draft: document.querySelector(".agent-draft textarea"), graphs: [...document.querySelectorAll(".react-flow")] }; return { source: document.querySelector(".cm-content").cmView.rootView.view.state.doc.toString(), draft: document.querySelector(".agent-draft textarea").value, cameras: [...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform) }; });
  await click(".activity-open-heading");
  assert.equal(await run(() => document.querySelectorAll(".github-prs li").length), prs.length, "Observation retained without refetch");
  assert.equal(requests.filter((type) => type === "githubPrs.refresh").length, 1);
  // Actual same-workspace remote failure must leave old cards visibly retained.
  execFileSync("git", ["remote", "set-url", "origin", "https://example.invalid/no/github"], { cwd: process.env.SWARM_ACTIVITY_ROOT, timeout: 2000 });
  await click('[aria-label="Refresh pull requests"]');
  await until(() => run(() => document.querySelector(".github-pr-notice")?.textContent.startsWith("Retained")), "actual unavailable origin retains previous observation");
  const after = await run(() => ({ source: document.querySelector(".cm-content").cmView.rootView.view.state.doc.toString(), draft: document.querySelector(".agent-draft textarea").value, cameras: [...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform), instances: globalThis.__activityRetained.source === document.querySelector(".cm-content") && globalThis.__activityRetained.draft === document.querySelector(".agent-draft textarea") && globalThis.__activityRetained.graphs.every((node, i) => node === document.querySelectorAll(".react-flow")[i]) }));
  assert.deepEqual(after.source, retained.source); assert.equal(after.draft, retained.draft); assert.deepEqual(after.cameras, retained.cameras); assert(after.instances);
  await fs.writeFile(path.join(evidence, "02-retained-pr-observation.png"), (await wc.capturePage()).toPNG());
  await click('[aria-label="Close logical changes"]');
  await click(".file-state button");
  await until(() => run(() => document.querySelector(".file-state")?.classList.contains("file-saved")), "save only owned proof file before close");
  assert.equal(await fs.readFile(path.join(process.env.SWARM_ACTIVITY_ROOT, chosen), "utf8"), retained.source);
  assert.deepEqual(requests.filter((type) => ["agent.launch", "agent.steer", "agent.cancel"].includes(type)), []);
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, realGithub: true, packagedCore: true, pullRequests: prs.length, sourcePath: chosen, sourceDraftCamerasRetained: true, sameOriginFailureRetained: true, explicitRequests: 2, modelTurns: 0, rendererErrors: errors, elapsedMs: Date.now() - start }));
  await until(() => fs.access(path.join(evidence, "close-request")).then(() => true, () => false), "owned close request"); app.quit();
}
main().catch(async (error) => { await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ error: error.stack, rendererErrors: errors, failures })); app.exit(1); });
