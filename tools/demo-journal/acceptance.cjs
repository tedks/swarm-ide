// TEST ONLY: unchanged packaged main/core/preload. No substitute provider or model.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const evidence = process.env.SWARM_JOURNAL_EVIDENCE;
const authoring = process.env.SWARM_JOURNAL_AUTHORING_PROOF;
const errors = [];
const observedRequests = [];
let holdSourceRead = false, releaseSourceRead = null;
const actualHandle = ipcMain.handle.bind(ipcMain);
// TEST-ONLY ordering control: hold one real source reply after production has
// produced it. No result bytes, request identity or provider are substituted.
ipcMain.handle = (channel, listener) => actualHandle(channel, async (event, input) => {
  const reply = await listener(event, input);
  if (channel === "swarm:request") {
    if (observedRequests.length >= 4096) throw new Error("Journal proof transport bound exceeded");
    observedRequests.push(input.type);
    if (holdSourceRead && input.type === "file.read" && input.path === "src/receipt.ts") {
      holdSourceRead = false;
      await new Promise((resolve) => { releaseSourceRead = resolve; });
    }
  }
  return reply;
});
app.on("web-contents-created", (_event, wc) => wc.on("console-message", (event) => { if (event.level === "error") errors.push(event.message); }));
require(path.join(process.env.SWARM_JOURNAL_PACKAGE, "app/electron/main.js"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) { const end = Date.now() + ms; while (Date.now() < end) { if (await check()) return; await delay(40); } throw new Error(`Timed out: ${label}`); }
async function main() {
  const start = Date.now(), fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  await app.whenReady(); assert.equal(app.getPath("userData"), process.env.SWARM_JOURNAL_PROFILE);
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window selection", 30000);
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => { addEventListener("error", (event) => console.error(event.error?.stack ?? event.message)); addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason)); });
  const click = async (selector, label = null) => {
    const p = await run((s, t) => { const e = [...document.querySelectorAll(s)].find((node) => t === null || node.textContent.trim() === t); if (!e || e.disabled) throw new Error(`Missing control ${s}: ${t}`); e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; if (!r.width || !r.height || !e.contains(document.elementFromPoint(x, y))) throw new Error(`Occluded ${s}`); return { x: Math.round(x), y: Math.round(y) }; }, selector, label);
    wc.sendInputEvent({ type: "mouseDown", ...p, button: "left", clickCount: 1 }); wc.sendInputEvent({ type: "mouseUp", ...p, button: "left", clickCount: 1 }); await delay(60);
  };
  const key = async (keyCode, modifiers = []) => { wc.sendInputEvent({ type: "keyDown", keyCode, modifiers }); wc.sendInputEvent({ type: "keyUp", keyCode, modifiers }); await delay(60); };
  const text = (selector) => run((s) => document.querySelector(s)?.textContent ?? "", selector);
  const screenshot = async (name) => fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG());
  await until(async () => (await run(() => document.querySelectorAll(".journal-activity-entry").length)) === 1, "actual first generated summary");
  await click(".journal-activity-entry");
  await until(() => run(() => document.querySelector(".journal-panel:not([hidden]) .journal-card")?.open), "entry expanded in main text area");
  await screenshot("01-activity-log-expanded.png");
  const serviceCamera = () => run(() => document.querySelector('[data-topology="service"] .react-flow__viewport')?.style.transform ?? null);
  const beforePan = await serviceCamera();
  const pan = await run(() => { const rect = document.querySelector('[data-topology="service"] .react-flow__pane').getBoundingClientRect(); return { x: Math.round(rect.x + rect.width * .5), y: Math.round(rect.y + rect.height * .5) }; });
  wc.sendInputEvent({ type: "mouseMove", ...pan }); wc.sendInputEvent({ type: "mouseDown", ...pan, button: "left", clickCount: 1 });
  wc.sendInputEvent({ type: "mouseMove", x: pan.x + 37, y: pan.y + 23, movementX: 37, movementY: 23 });
  wc.sendInputEvent({ type: "mouseUp", x: pan.x + 37, y: pan.y + 23, button: "left", clickCount: 1 });
  await until(async () => await serviceCamera() !== beforePan, "independent deliberate service camera");
  const retainedServiceCamera = await serviceCamera();
  await click(".journal-card[open] .journal-evidence > summary");
  holdSourceRead = true;
  await click(".journal-card[open] .journal-evidence[open] .journal-paths button");
  await until(() => Boolean(releaseSourceRead), "held actual source reply");
  assert(await run(() => Boolean(document.querySelector(".journal-panel:not([hidden])"))), "Journal remains visible until authoritative source handoff settles");
  assert.equal(await serviceCamera(), retainedServiceCamera, "pending first-source handoff cannot reframe unrelated service camera");
  releaseSourceRead(); releaseSourceRead = null;
  await until(() => run(() => Boolean(document.querySelector(".source-surface:not([hidden]) .cm-content"))), "working file source");
  assert.equal(await serviceCamera(), retainedServiceCamera, "settled first-source handoff retains unrelated service camera");
  await click(".source-surface:not([hidden]) .cm-content"); await key("End", ["control"]); await wc.insertText("\n// retained operator buffer");
  await until(() => text(".source-surface").then((value) => value.includes("retained operator buffer")), "dirty source text");
  const cameras = () => run(() => [...document.querySelectorAll(".react-flow__viewport")].map((e) => e.style.transform));
  const baselineCamera = await cameras();
  const sourceText = await text(".cm-content");
  await click(".agent-dock-welcome .agent-primary");
  await until(() => run(() => Boolean(document.querySelector(".agent-draft textarea"))), "real unlaunched agent draft");
  const draftBefore = await run(() => document.querySelector(".agent-draft textarea").value);
  assert((await text(".agent-draft")).includes("src/receipt.ts"), "explicit evidence source uses the ordinary authoritative source handoff");
  await run(() => { window.__journalRetained = { source: document.querySelector(".cm-content"), draft: document.querySelector(".agent-draft textarea"),
    graphs: [...document.querySelectorAll(".react-flow")] }; });
  // Joined Plan/Activity composition: deliberately read the actual absent index,
  // then inspect Activity without hiding Plan or retargeting the open source.
  await click(".lens-tabs button", "Plan");
  await click(".planning-tabs button", "Plans & components");
  await click('[aria-label="Authored plan hierarchy"] button', "Load plan index");
  await until(() => text('[aria-label="Authored plan hierarchy"] .planning-status').then((value) => value.includes("PLAN_INDEX_UNAVAILABLE")), "real missing plan index stays unavailable beside Activity");
  await click(".journal-activity-heading");
  assert(await run(() => !document.querySelector(".planning-field").hidden && !document.querySelector(".journal-panel").hidden), "Plan and Activity main document coexist");
  assert.equal(await text(".cm-content"), sourceText); assert.equal(await run(() => document.querySelector(".agent-draft textarea").value), draftBefore);
  await screenshot("03-plan-activity-coexistence.png");
  await click(".lens-tabs button", "System");
  assert.deepEqual(await cameras(), baselineCamera, "joined Plan/Activity round-trip retains System cameras");
  await click(".journal-activity-heading");
  await fs.copyFile(path.join(authoring, "proof-second-bundle.json"), path.join(fixture.root, ".swarm/changelog-bundle.json"));
  await click('[aria-label="Refresh logical changes"]');
  await until(() => text(".journal-warning").then((value) => value.includes("Retained")), "stale generation refused, old observation retained");
  assert.equal(await run(() => document.querySelectorAll(".journal-card").length), 1);
  await fs.copyFile(path.join(authoring, "summary-proof-second.raw.json"), path.join(fixture.root, ".swarm/changelog-candidate.json"));
  const validation = execFileSync("bash", [process.env.SWARM_JOURNAL_AUTHOR_SCRIPT, "validate", fixture.root], { cwd: process.env.SWARM_JOURNAL_SOURCE, timeout: 15000, encoding: "utf8", env: { ...process.env, ELECTRON_RUN_AS_NODE: "" } });
  await fs.writeFile(path.join(evidence, "second-validation.txt"), validation);
  await click('[aria-label="Refresh logical changes"]');
  await until(() => run(() => document.querySelectorAll(".journal-card").length === 2 && !document.querySelector(".journal-warning")), "new actual summary after validated refresh");
  await screenshot("02-new-logical-change.png");
  assert.equal(await text(".cm-content"), sourceText); assert.equal(await run(() => document.querySelector(".agent-draft textarea").value), draftBefore);
  assert.deepEqual(await cameras(), baselineCamera);
  assert(await run(() => window.__journalRetained.source === document.querySelector(".cm-content") &&
    window.__journalRetained.draft === document.querySelector(".agent-draft textarea") &&
    window.__journalRetained.graphs.every((element, index) => element === document.querySelectorAll(".react-flow")[index])), "source/draft/graph DOM instances retained");
  const output = path.join(fixture.root, ".swarm/changelog.json"), valid = await fs.readFile(output, "utf8");
  const invalid = JSON.parse(valid); invalid.entries[0].outcome.evidenceIds = ["unknown-citation"];
  await fs.writeFile(output, JSON.stringify(invalid));
  await click('[aria-label="Refresh logical changes"]');
  await until(() => text(".journal-warning").then((value) => value.includes("Retained")), "unknown citation rejected without replacing retained entries");
  assert.equal(await run(() => document.querySelectorAll(".journal-card").length), 2);
  await fs.writeFile(output, valid); await click('[aria-label="Refresh logical changes"]');
  await until(() => run(() => !document.querySelector(".journal-warning")), "valid artifact recovery");
  await key("w", ["control"]);
  assert.equal(await text(".cm-content"), sourceText, "closing Activity must not close the source buffer");
  assert.equal(errors.length, 0, `Renderer exceptions: ${JSON.stringify(errors)}`);
  const productMutations = observedRequests.filter((type) => ["agent.launch", "agent.steer", "agent.cancel"].includes(type));
  assert.deepEqual(productMutations, [], "Activity/Plan inspection must not launch or steer an agent");
  await fs.writeFile(path.join(evidence, "journal-proof.json"), JSON.stringify({ ok: true, realGit: true, packagedCore: true,
    productModelTurns: 0, supervisedSummarizer: JSON.parse(valid).generator, inputDigest: JSON.parse(valid).inputDigest,
    firstDigest: fixture.firstDigest, secondDigest: fixture.secondDigest,
    actualRawOutputHash: createHash("sha256").update(valid).digest("hex"), sourceRetained: true, draftRetained: true, camerasRetained: true,
    staleRejected: true, unknownCitationRejected: true, timingControlledRealSourceReply: true, serviceCameraRetained: true,
    planActivityCoexistence: true, missingPlanIndexUnavailable: true, productMutations,
    rendererErrors: errors, milliseconds: Date.now() - start }, null, 2));
}
void main().catch(async (error) => { releaseSourceRead?.(); await fs.writeFile(path.join(evidence, "journal-failure.json"), JSON.stringify({ error: error.stack, rendererErrors: errors }, null, 2)); console.error(error); });
