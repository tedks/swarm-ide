// Test driver around the unchanged production archive. No replacement renderer.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const evidence = process.env.SWARM_STEERING_EVIDENCE, rendererErrors = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push(event.message); });
  contents.on("render-process-gone", (_event, info) => rendererErrors.push(`Renderer gone: ${info.reason}`));
});
require(path.join(process.env.SWARM_STEERING_PACKAGE, "app/electron/main.js"));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(check, label, ms = 15000) {
  const limit = Date.now() + ms;
  while (!await check()) { if (Date.now() > limit) throw new Error(`Timed out: ${label}`); await delay(30); }
}
async function main() {
  const fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  await app.whenReady();
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window selection", 30000);
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const click = (selector) => run((s) => { const node = document.querySelector(s); if (!node || node.disabled) throw new Error(`Unavailable: ${s}`); node.scrollIntoView({ block: "nearest" }); node.click(); }, selector);
  const label = (text) => `[aria-label=${JSON.stringify(text)}]`;
  const request = (fields) => run(async (fields) => window.swarm.request({ protocolVersion: 7, requestId: `steering-proof:${crypto.randomUUID()}`, ...fields }), fields);
  const sendSelector = "[aria-label='Session steering'] button[type='submit']";
  const textarea = "[aria-label='Session steering'] textarea";
  await run(() => {
    addEventListener("error", (event) => console.error(event.error?.stack ?? event.message));
    addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason));
  });
  await until(() => run(() => document.querySelectorAll("[aria-label='Fork lineage'] li").length === 2), "two controlled registrations");
  await click(label("Open file README.md"));
  await until(() => run(() => Boolean(document.querySelector(".cm-content"))), "actual source editor");
  await run(() => document.querySelector(".cm-content").cmView.rootView.view.focus());
  await wc.insertText("Unsaved human draft\n");
  // Allow source navigation's own camera animation to settle before baseline.
  await run(() => new Promise((resolve, reject) => {
    let prior = "", stable = 0, count = 0;
    function frame() {
      const value = JSON.stringify([...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform));
      stable = value === prior ? stable + 1 : 0; prior = value;
      if (stable >= 5) resolve(); else if (++count >= 90) reject(new Error("Source camera did not settle")); else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
  const retained = await run(() => {
    globalThis.__steeringGraphs = [...document.querySelectorAll(".graphs-grid > *")];
    return { source: document.querySelector(".cm-content").cmView.rootView.view.state.doc.toString(), cameras: [...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform) };
  });
  const inspect = async (session) => {
    await click(label(`Inspect external agent ${session.label}`));
    await until(() => run((id) => document.querySelector("[aria-label='Session steering']")?.textContent.includes(id), session.id), "steering target");
    await until(() => run((selector) => !document.querySelector(selector)?.disabled, textarea), "available checked local target");
  };
  const nativeSend = async (text) => {
    win.focus(); wc.focus();
    await until(() => win.isFocused() && wc.isFocused(), "native window focus");
    await run((selector) => document.querySelector(selector).focus(), textarea);
    await wc.insertText(text);
    await until(() => run((selector) => !document.querySelector(selector).disabled, sendSelector), "explicit send enabled");
    await run((selector) => {
      const button = document.querySelector(selector); button.scrollIntoView({ block: "nearest" }); button.focus();
      if (document.activeElement !== button) throw new Error("Send did not receive focus");
      globalThis.__steeringNativeClick = false;
      button.addEventListener("click", (event) => { globalThis.__steeringNativeClick = event.isTrusted; }, { once: true });
    }, sendSelector);
    wc.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    wc.sendInputEvent({ type: "char", keyCode: "\r" });
    wc.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await until(() => run(() => globalThis.__steeringNativeClick === true), "trusted native Send activation");
  };
  await inspect(fixture.sessions[0]);
  const injectionMarker = path.join(fixture.root, "SHOULD_NOT_EXIST");
  const message = `Controlled synthetic queue proof\n--help; $(touch ${injectionMarker}) & echo 'literal' | true\nUnicode: café 🧭`;
  await nativeSend(message);
  await until(() => run(() => Boolean(document.querySelector("[data-delivery-status='queued']"))), "queued receipt");
  assert((await run(() => document.querySelector("[data-delivery-status='queued']").textContent)).includes(fixture.receipt));
  assert.equal(await run((selector) => document.querySelector(selector).value, textarea), "", "queued clears exact submitted draft");
  assert.equal(await fs.access(injectionMarker).then(() => true, () => false), false, "metacharacters never become a shell command");
  let calls = (await fs.readFile(fixture.capture, "utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(calls, [["queue", "--thread", fixture.sessions[0].id, "--message", message]]);
  await run(() => document.querySelector("[data-delivery-status='queued']").scrollIntoView({ block: "center" }));
  await run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await fs.writeFile(path.join(evidence, "queued.png"), (await wc.capturePage()).toPNG());
  const returnToSource = () => run(() => [...document.querySelectorAll(".external-information button")].find((node) => node.textContent === "Return to source information").click());
  await returnToSource();
  assert.equal(await run(() => document.querySelector(".external-information").hidden), true);
  await inspect(fixture.sessions[0]);
  assert.equal(await run(() => document.querySelector("[data-delivery-status='queued']")?.textContent.includes("consumption not confirmed")), true, "queue receipt survives return/reopen");
  await run((selector) => document.querySelector(selector).focus(), textarea);
  await wc.insertText("Unsent instruction retained across source navigation");
  await returnToSource(); await inspect(fixture.sessions[0]);
  assert.equal(await run((selector) => document.querySelector(selector).value, textarea), "Unsent instruction retained across source navigation");
  const stale = await request({ type: "externalAgents.send", sessionId: fixture.sessions[0].id, observationId: "0".repeat(64), text: "Must reject stale target" });
  assert(stale.ok && stale.external.kind === "send" && stale.external.status === "rejected");
  await inspect(fixture.sessions[1]);
  // Only our explicit private socket/pane is closed. The primary survives.
  const closed = fixture.sessions[1].tmux;
  execFileSync("tmux", ["-S", closed.socket, "kill-pane", "-t", closed.paneId], { timeout: 2000 });
  const rejectedDraft = "Controlled closed-pane message; must remain a draft";
  await nativeSend(rejectedDraft);
  await until(() => run(() => Boolean(document.querySelector("[data-delivery-status='rejected']"))), "closed target rejection");
  assert.equal(await run((selector) => document.querySelector(selector).value, textarea), rejectedDraft);
  calls = (await fs.readFile(fixture.capture, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(calls.length, 1, "stale and closed targets never execute queue fixture");
  await run(() => document.querySelector("[data-delivery-status='rejected']").scrollIntoView({ block: "center" }));
  await run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await fs.writeFile(path.join(evidence, "closed-pane-rejected.png"), (await wc.capturePage()).toPNG());
  await run(() => [...document.querySelectorAll(".external-information button")].find((node) => node.textContent === "Return to source information").click());
  const final = await run(() => ({
    source: document.querySelector(".cm-content").cmView.rootView.view.state.doc.toString(),
    cameras: [...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform),
    graphInstances: globalThis.__steeringGraphs.every((node) => node.isConnected),
    dirty: document.querySelector(".file-state").textContent.includes("dirty"),
  }));
  assert.equal(final.source, retained.source); assert.deepEqual(final.cameras, retained.cameras); assert(final.graphInstances && final.dirty);
  // Save only after proving dirty retention, through ordinary UI, so the dirty
  // guard does not veto this proof's deliberate normal app close.
  await click(".file-state button");
  await until(() => run(() => document.querySelector(".file-state").classList.contains("file-saved")), "ordinary save before close");
  assert.equal(await fs.readFile(path.join(fixture.root, "README.md"), "utf8"), retained.source);
  assert.deepEqual(rendererErrors, []);
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({
    ok: true, controlledSynthetic: true, packaged: true, modelTurns: 0,
    nativeExplicitSend: true, literalArgv: true, queuedReceipt: true,
    staleRejected: true, closedPaneRejected: true, navigationDraftAndReceiptRetained: true, sourceAndCamerasRetained: true, rendererErrors,
  }));
  await until(() => fs.access(path.join(evidence, "close-request")).then(() => true, () => false), "owner close request");
  app.quit();
}
main().catch(async (error) => {
  await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ stage: "acceptance", message: error.stack, rendererErrors }));
  app.exit(1);
});
