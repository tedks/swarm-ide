// Owned virtual driver around the unchanged packaged production composition.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_ARTIFACT_DIR, sessionId = process.env.SWARM_SPRITE_SESSION, errors = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") errors.push(event.message); });
  contents.on("render-process-gone", (_event, info) => errors.push(info.reason));
});
require(path.join(process.env.SWARM_SPRITE_PACKAGE, "app/electron/main.js"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, description) { const deadline = Date.now() + 45000; while (!await check()) { if (Date.now() > deadline) throw new Error(`Timed out: ${description}`); await delay(50); } }
async function main() {
  await app.whenReady();
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window selection");
  const win = BrowserWindow.getAllWindows()[0], contents = win.webContents;
  const run = (fn, ...args) => contents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await until(() => run((id) => !!document.querySelector(`.graph-agent-sprite[data-agent-id='${id}']`), sessionId), "actual registered graph sprite");
  const actual = await run((id) => [...document.querySelectorAll(`.graph-agent-sprite[data-agent-id='${id}']`)].map((element) => ({ path: element.dataset.agentPath, title: element.title, node: element.closest(".react-flow__node")?.dataset.id })), sessionId);
  assert(actual.length > 0 && actual.every((entry) => entry.path && entry.node));
  // Open one real source through the ordinary palette and retain a local edit.
  const source = "README.md";
  await run(() => document.querySelector(".command-trigger").click());
  await until(() => run(() => !!document.querySelector(".command-palette input")), "palette");
  await run((value) => { const input = document.querySelector(".command-palette input"); input.focus(); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }, source);
  await until(() => run(() => [...document.querySelectorAll(".command-palette button")].some((button) => button.textContent.includes("README.md"))), "source palette result");
  await run(() => [...document.querySelectorAll(".command-palette button")].find((button) => button.textContent.includes("README.md")).click());
  await until(() => run(() => !!document.querySelector(".cm-content")), "source editor");
  await run(() => document.querySelector(".cm-content").focus());
  contents.insertText("SPRITE PROOF LOCAL BUFFER ");
  await until(() => run(() => document.querySelector(".cm-content")?.textContent.includes("SPRITE PROOF LOCAL BUFFER")), "local buffer");
  const before = await run(() => ({ text: document.querySelector(".cm-content").textContent, cursor: document.getSelection()?.anchorOffset,
    cameras: [...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform) }));
  await run((id) => document.querySelector(`.graph-agent-sprite[data-agent-id='${id}']`).click(), sessionId);
  await until(() => run((id) => document.querySelector(".agent-conversation")?.dataset.externalSession === id, sessionId), "exact conversation selection");
  const after = await run(() => ({ text: document.querySelector(".cm-content").textContent, cameras: [...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform) }));
  assert.equal(after.text, before.text); assert.deepEqual(after.cameras, before.cameras); assert.deepEqual(errors, []);
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ registeredObservation: true, sessionId, actual, sourceRetained: true, camerasRetained: true, modelTurns: 0, errors }));
  await until(() => fs.access(path.join(evidence, "close-request")).then(() => true, () => false), "capture");
  app.quit();
}
main().catch(async (error) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) await fs.writeFile(path.join(evidence, "failure.png"), (await win.capturePage()).toPNG());
  await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ message: error.stack, errors })); app.exit(1);
});
