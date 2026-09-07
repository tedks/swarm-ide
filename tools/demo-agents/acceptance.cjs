// Test driver only. Unchanged production archive, real bridge and owned files.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const evidence = process.env.SWARM_EXTERNAL_EVIDENCE, rendererErrors = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push(event.message); });
  contents.on("render-process-gone", (_event, info) => rendererErrors.push(`Renderer gone: ${info.reason}`));
});
require(path.join(process.env.SWARM_EXTERNAL_PACKAGE, "app/electron/main.js"));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(check, label, ms = 15000) { const limit = Date.now() + ms; while (!await check()) { if (Date.now() > limit) throw new Error(`Timed out: ${label}`); await delay(30); } }
async function main() {
  const started = Date.now(), fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  await app.whenReady();
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window selection", 30000);
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const click = (selector) => run((s) => { const node = document.querySelector(s); if (!node || node.disabled) throw new Error(`Unavailable: ${s}`); node.scrollIntoView({ block: "nearest" }); node.click(); }, selector);
  const label = (text) => `[aria-label=${JSON.stringify(text)}]`;
  await run(() => { addEventListener("error", (event) => console.error(event.error?.stack ?? event.message)); addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason)); });
  await until(() => run(() => document.querySelectorAll("[aria-label='Fork lineage'] li").length === 8), "registered eight-level tree");
  assert.equal(await run(() => document.querySelector("[aria-label='Fork lineage'] li:last-child").dataset.depth), "7");
  await click(label("Open file README.md"));
  await until(() => run(() => Boolean(document.querySelector(".cm-content"))), "actual source editor");
  await run(() => document.querySelector(".cm-content").cmView.rootView.view.focus());
  await wc.insertText("Unsaved human draft\n");
  // Source activation deliberately reframes its directory across animation
  // frames. Capture the baseline only once that preceding navigation settles.
  const settling = await run(() => new Promise((resolve, reject) => {
    const frames = []; let prior = "", stable = 0;
    function frame() {
      const value = JSON.stringify([...document.querySelectorAll(".react-flow__viewport")].map((n) => n.style.transform)); frames.push(value);
      stable = value === prior ? stable + 1 : 0; prior = value;
      if (stable >= 5) resolve(frames); else if (frames.length >= 90) reject(new Error("Source navigation camera did not settle")); else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
  await fs.writeFile(path.join(evidence, "source-camera-settling.json"), JSON.stringify(settling));
  const retained = await run(() => { globalThis.__externalGraphNodes = [...document.querySelectorAll(".graphs-grid > *")]; return { source: document.querySelector(".cm-content").cmView.rootView.view.state.doc.toString(), cameras: [...document.querySelectorAll(".react-flow__viewport")].map((n) => n.style.transform) }; });
  const tmux = (...args) => execFileSync("tmux", ["-S", fixture.target.socket, ...args], { encoding: "utf8", timeout: 2000 });
  const active = () => tmux("display-message", "-p", "-t", "owned", "#{window_id}").trim();
  assert.equal(active(), fixture.other);
  await click(label("Inspect external agent Synthetic worker 8"));
  await until(() => run(() => document.querySelector("[aria-label='External agent information']")?.textContent.includes("Synthetic worker 8: I report")), "actual recorded worklog");
  assert.equal(active(), fixture.other, "mere agent selection does not hand off");
  assert(!(await run(() => document.querySelector("[aria-label='External agent information']").textContent)).includes("PRIVATE_"));
  await fs.writeFile(path.join(evidence, "lineage-worklog.png"), (await wc.capturePage()).toPNG());
  await click(".external-information nav button:last-child");
  await until(() => run(() => document.querySelectorAll("[aria-label='Recorded assistant conversation'] li").length === 2), "actual assistant conversation, not recap replacement");
  await fs.writeFile(path.join(evidence, "conversation.png"), (await wc.capturePage()).toPNG());
  await run(() => { const button = [...document.querySelectorAll(".external-actions button")].find((node) => node.textContent === "Open conversation in tmux"); if (!button || button.disabled) throw new Error("Handoff unexpectedly unavailable"); button.click(); });
  await until(() => active() === fixture.target.windowId, "explicit identity-checked owned tmux handoff");
  await until(() => run(() => document.querySelector(".external-information").textContent.includes("Selected the existing registered tmux conversation")), "handoff acknowledgement");
  await run(() => [...document.querySelectorAll(".external-information button")].find((node) => node.textContent === "Return to source information").click());
  const final = await run(() => ({ source: document.querySelector(".cm-content").cmView.rootView.view.state.doc.toString(), cameras: [...document.querySelectorAll(".react-flow__viewport")].map((n) => n.style.transform), graphInstances: globalThis.__externalGraphNodes.every((node) => node.isConnected), dirty: document.querySelector(".file-state").textContent.includes("dirty") }));
  assert.equal(final.source, retained.source); assert.deepEqual(final.cameras, retained.cameras); assert(final.graphInstances && final.dirty);
  const agent = await run(async () => window.swarm.request({ protocolVersion: 7, requestId: `proof:${crypto.randomUUID()}`, type: "agent.snapshot" }));
  assert(agent.ok && !agent.agent.snapshot.capabilities.controls.launch && agent.agent.snapshot.runs.length === 0);
  assert.deepEqual(rendererErrors, []);
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, synthetic: true, packaged: true, modelTurns: 0, depth: 7, sourceAndCamerasRetained: true, handoff: true, rendererErrors, elapsedMs: Date.now() - started }));
  await until(() => fs.access(path.join(evidence, "close-request")).then(() => true, () => false), "owner close request");
  app.quit();
}
main().catch(async (error) => { await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ stage: "acceptance", message: error.stack, rendererErrors })); app.exit(1); });
