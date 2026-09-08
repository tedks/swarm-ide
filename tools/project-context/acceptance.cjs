const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_PROJECT_CONTEXT_EVIDENCE;
const rendererErrors = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push(event.message); });
  contents.on("render-process-gone", (_event, details) => rendererErrors.push(details.reason));
});
require(path.join(process.env.SWARM_CONTEXT_PACKAGE, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label) {
  const end = Date.now() + 20000;
  while (Date.now() < end) { if (await check()) return; await sleep(50); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now(), fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  await app.whenReady();
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned window");
  const win = BrowserWindow.getAllWindows()[0]; assert(win);
  const wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await until(() => run((pid) => document.querySelector(".project-runtime")?.textContent.includes(`PID ${pid}`), fixture.pid), "real Node process appears");
  const link = await run((port) => [...document.querySelectorAll(".project-runtime a")].find((node) => new URL(node.href).port === String(port))?.href, fixture.port);
  assert.equal(link, `http://localhost:${fixture.port}/`);
  assert(await run(() => document.querySelector(".project-runtime")?.textContent.includes("No containers for this worktree")));
  const observed = await run(() => document.querySelector(".project-runtime")?.textContent);
  assert(!observed.includes("goals-local"), "unrelated host containers excluded");
  await run(() => document.querySelector(".project-runtime").scrollIntoView({ block: "center" }));
  await run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await fs.writeFile(path.join(evidence, "project-runtime.png"), (await wc.capturePage()).toPNG());
  assert.deepEqual(rendererErrors, []);
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, realNodeServer: true, pid: fixture.pid, port: fixture.port, elapsedMs: Date.now() - started, rendererErrors }));
  win.close();
}
main().catch(async (error) => {
  await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ message: String(error.stack ?? error), rendererErrors }));
  app.exit(1);
});
