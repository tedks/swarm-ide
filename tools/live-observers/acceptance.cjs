// Owned test driver; production package and bridge, explicitly controlled JSONL.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_LIVE_EVIDENCE, rendererErrors = [];
app.on("will-quit", () => {
  require("node:fs").writeFileSync(path.join(evidence, "renderer-close.json"), JSON.stringify({ rendererErrors }));
  if (rendererErrors.length) app.exit(1);
});
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push(event.message); });
  contents.on("render-process-gone", (_event, info) => rendererErrors.push(`Renderer gone: ${info.reason}`));
});
require(path.join(process.env.SWARM_LIVE_PACKAGE, "app/electron/main.js"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) { const end = Date.now() + ms; while (!await check()) { if (Date.now() > end) throw new Error(`Timed out: ${label}`); await delay(30); } }
const record = (text) => JSON.stringify({ timestamp: new Date().toISOString(), type: "response_item", payload: { type: "message", role: "assistant", phase: "commentary", content: [{ type: "output_text", text }] } }) + "\n";
async function main() {
  const started = Date.now(), fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  await app.whenReady();
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned native window", 30000);
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const label = (text) => `[aria-label=${JSON.stringify(text)}]`;
  const click = (selector) => run((s) => { const node = document.querySelector(s); if (!node || node.disabled) throw new Error(`Unavailable: ${s}`); node.scrollIntoView({ block: "nearest" }); node.click(); }, selector);
  const contains = (selector, text) => run((s, value) => Boolean(document.querySelector(s)?.textContent.includes(value)), selector, text);
  await run(() => { addEventListener("error", (event) => console.error(event.error?.stack ?? event.message)); addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason)); });
  await until(() => run(() => document.querySelectorAll("[aria-label='Fork lineage'] li").length === 2), "two explicit controlled sessions");
  await click(label("Open file README.md"));
  await until(() => run(() => Boolean(document.querySelector(".cm-content"))), "real owned source");
  await run(() => document.querySelector(".cm-content").cmView.rootView.view.focus());
  await wc.insertText("Unsaved source intent\n");
  await click(".agent-rail .agent-primary");
  await until(() => run(() => Boolean(document.querySelector(".agent-draft textarea"))), "independent fixed-focus draft");
  await run(() => {
    const node = document.querySelector(".agent-draft textarea");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(node, "Preserve my independent instructions while observing the swarm.");
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await run(() => new Promise((resolve, reject) => {
    let prior = "", stable = 0, count = 0;
    function frame() {
      const value = JSON.stringify([...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform));
      stable = value === prior ? stable + 1 : 0; prior = value;
      if (stable >= 5) resolve(); else if (++count >= 90) reject(new Error("Source camera did not settle")); else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
  await run(() => {
    const editor = document.querySelector(".cm-content"), state = editor.cmView.rootView.view.state, draft = document.querySelector(".agent-draft textarea");
    globalThis.__liveProof = { editor, draft, graphs: [...document.querySelectorAll(".graphs-grid > *")],
      source: state.doc.toString(), anchor: state.selection.main.anchor, head: state.selection.main.head,
      instructions: draft.value, cameras: [...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform) };
  });
  win.focus(); wc.focus();
  await until(() => win.isFocused() && wc.isFocused(), "native focus");
  await run((selector) => { const node = document.querySelector(selector); node.scrollIntoView({ block: "nearest" }); node.focus(); if (node !== document.activeElement) throw new Error("Agent selection lacks focus"); }, label("Inspect external agent Controlled worker 2"));
  wc.sendInputEvent({ type: "keyDown", keyCode: "Enter" }); wc.sendInputEvent({ type: "char", keyCode: "\r" }); wc.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
  const worklog = label("Recorded agent worklog"), activity = label("Latest observed transcript entries");
  await until(() => contains(worklog, "Controlled worker 2: initial bounded observation."), "initial registered observation");
  await until(() => contains(activity, "Controlled worker 2: initial bounded observation."), "visible observed activity instrument");
  const appended = "E3 live append: investigating the consumer contract; controlled transcript, not a real model turn.";
  const appendedAt = Date.now();
  await fs.appendFile(fixture.sessions[1].rollout, record(appended));
  await until(() => contains(worklog, appended), "automatic selected-session append");
  await until(() => contains(activity, appended), "automatic observed activity append");
  const appendLatencyMs = Date.now() - appendedAt;
  await fs.writeFile(path.join(evidence, "01-automatic-append.png"), (await wc.capturePage()).toPNG());
  const third = { ...fixture.sessions[0], id: "20000000-0000-4000-8000-000000000003", label: "Controlled worker 3", rollout: path.join(path.dirname(fixture.registry), "session-3.jsonl") };
  await fs.writeFile(third.rollout, JSON.stringify({ type: "session_meta", payload: { id: third.id, forked_from_id: fixture.sessions[0].id } }) + "\n" + record("Controlled worker 3: newly registered."), { mode: 0o600 });
  await fs.writeFile(fixture.registry, JSON.stringify({ version: 1, sessions: [...fixture.sessions, third] }));
  await until(() => run(() => document.querySelectorAll("[aria-label='Fork lineage'] li").length === 3), "automatic registry discovery");
  assert(await contains(worklog, appended), "registry refresh retains selected detail");
  // Cross the core's 256 KiB tail boundary. Offset/index entry IDs change: the
  // renderer must replace the bounded observation, not concatenate snapshots.
  const terminal = "E3 tail boundary: selected worker's newest controlled update.";
  await fs.appendFile(fixture.sessions[1].rollout, Array.from({ length: 150 }, (_, i) => record(`Controlled bounded entry ${i}: ${"x".repeat(2100)}`)).join("") + record(terminal));
  await until(() => contains(worklog, terminal), "automatic bounded tail replacement");
  await until(() => contains(activity, terminal), "latest activity replaces bounded tail");
  const tail = await run((selector) => { const rows = [...document.querySelector(selector).querySelectorAll("li p")].map((node) => node.textContent); return { rows, all: document.querySelector(selector).textContent }; }, worklog);
  assert(tail.rows.length <= 120 && tail.rows.length > 0);
  assert.equal(new Set(tail.rows).size, tail.rows.length, "bounded replacement cannot duplicate repeated snapshots");
  assert.equal(tail.rows.filter((text) => text === terminal).length, 1);
  assert(!tail.all.includes(appended), "old entry outside bounded tail is not retained as invented history");
  assert(await contains(label("External agent information"), "Partial tail."));
  await fs.writeFile(path.join(evidence, "02-bounded-tail.png"), (await wc.capturePage()).toPNG());
  // Let a subsequent observation produce a fresh envelope with the same tail;
  // it must not duplicate events or clear the current selection and source.
  await delay(1400);
  assert.equal(await run((s, value) => [...document.querySelector(s).querySelectorAll("li p")].filter((node) => node.textContent === value).length, worklog, terminal), 1);
  const retained = await run((id) => {
    const saved = globalThis.__liveProof, editor = document.querySelector(".cm-content"), state = editor.cmView.rootView.view.state;
    return { editor: editor === saved.editor, draft: document.querySelector(".agent-draft textarea") === saved.draft,
      source: state.doc.toString() === saved.source, cursor: state.selection.main.anchor === saved.anchor && state.selection.main.head === saved.head,
      instructions: saved.draft.value === saved.instructions, graphInstances: saved.graphs.every((node) => node.isConnected),
      cameras: JSON.stringify([...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform)) === JSON.stringify(saved.cameras),
      selected: document.querySelector("[aria-label='External agent information']")?.dataset.externalSession === id };
  }, fixture.sessions[1].id);
  assert(Object.values(retained).every(Boolean), JSON.stringify(retained));
  await run(() => [...document.querySelectorAll(".external-information button")].find((node) => node.textContent === "Return to source information").click());
  await click(".file-state button");
  await until(() => run(() => document.querySelector(".file-state").classList.contains("file-saved")), "ordinary save before clean close");
  assert.equal(await fs.readFile(path.join(fixture.root, "README.md"), "utf8"), await run(() => globalThis.__liveProof.source));
  // Preservation above is the behavior under test. Deliberately discard only
  // this proof's owned draft afterward so the unchanged intent guard can close.
  await click(label("Close launch draft"));
  await until(() => run(() => !document.querySelector(".agent-draft textarea")), "explicit owned draft close");
  assert.deepEqual(rendererErrors, []);
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, controlled: true, packaged: true, modelTurns: 0,
    automaticAppend: true, automaticRegistryDiscovery: true, appendLatencyMs, tailReplacedWithoutDuplicates: true, rows: tail.rows.length, retained, rendererErrors, elapsedMs: Date.now() - started }));
  await until(() => fs.access(path.join(evidence, "close-request")).then(() => true, () => false), "owner close request");
  app.quit();
}
main().catch(async (error) => { await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ stage: "acceptance", message: error.stack, rendererErrors })); app.exit(1); });
