const { app, BrowserWindow, shell } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_PROJECT_CONTEXT_EVIDENCE;
const rendererErrors = [];
const opened = [];
// Observe the native browser handoff without opening a browser on any desktop.
shell.openExternal = async (url) => { opened.push(url); };
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
  await run(() => document.querySelector(".project-runtime a").scrollIntoView({ block: "center" }));
  const point = await run(() => { const box = document.querySelector(".project-runtime a").getBoundingClientRect(); return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }; });
  wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
  wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
  await until(() => opened.includes(link), "native web link handoff");
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  assert(await run(() => ![...document.querySelectorAll(".project-runtime h3")].some((node) => node.textContent.startsWith("Containers"))), "empty containers are hidden");
  await until(() => run(() => document.querySelector(".project-catalog")?.textContent.includes("ProofConsumer")), "actual manifest catalog");
  assert(await run(() => [...document.querySelectorAll(".project-catalog a")].some((node) => node.href === "https://docs.example.org/")), "configured Hugo destination");
  assert(await run(() => document.querySelector(".project-catalog")?.textContent.includes("depends on")), "actual local Move dependency");
  assert(await run(() => document.querySelector(".project-catalog")?.textContent.includes("Configured")), "site is configuration, not measured deployment");
  const observed = await run(() => document.querySelector(".project-runtime")?.textContent);
  assert(!observed.includes("goals-local"), "unrelated host containers excluded");
  await run(() => document.querySelector(".project-runtime").scrollIntoView({ block: "center" }));
  await run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await fs.writeFile(path.join(evidence, "project-runtime.png"), (await wc.capturePage()).toPNG());
  assert.deepEqual(rendererErrors, []);
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, realNodeServer: true, realManifestCatalog: true, configuredHugoSite: true, localMoveDependency: true, emptyContainersHidden: true, browserHandoff: opened, pid: fixture.pid, port: fixture.port, elapsedMs: Date.now() - started, rendererErrors }));
  // Keep the window alive for the owned scenario's final capture. The harness
  // then terminates this exact application/process group.
}
main().catch(async (error) => {
  await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ message: String(error.stack ?? error), rendererErrors }));
  app.exit(1);
});
