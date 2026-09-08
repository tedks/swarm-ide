const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_RECENTER_EVIDENCE, rendererErrors = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push(event.message); });
  contents.on("render-process-gone", (_event, details) => rendererErrors.push(details.reason));
});
require(path.join(process.env.SWARM_RECENTER_PACKAGE, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) { const deadline = Date.now() + ms; while (Date.now() < deadline) { if (await check()) return; await sleep(50); } throw new Error(`Timed out: ${label}`); }
async function main() {
  const started = Date.now(); await app.whenReady();
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned X11 selection");
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const frame = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const point = async (selector) => {
    await run((selector) => { const element = document.querySelector(selector); if (!element) throw new Error(`Missing ${selector}`); element.scrollIntoView({ block: "nearest", inline: "nearest" }); }, selector);
    await frame();
    return run((selector) => { const element = document.querySelector(selector), r = element.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
      if (!element.contains(document.elementFromPoint(x, y))) throw new Error(`Native click target is not visible: ${selector} at ${x},${y}`);
      return { x, y };
    }, selector);
  };
  const click = async (selector) => { const p = await point(selector); wc.sendInputEvent({ type: "mouseMove", ...p }); wc.sendInputEvent({ type: "mouseDown", ...p, button: "left", clickCount: 1 }); wc.sendInputEvent({ type: "mouseUp", ...p, button: "left", clickCount: 1 }); await frame(); };
  const serviceSelector = '[data-topology="service"]';
  const transform = () => run((selector) => document.querySelector(`${selector} .react-flow__viewport`)?.style.transform, serviceSelector);
  const inView = (selector, id) => run((selector, id) => {
    const pane = document.querySelector(`${selector} .react-flow`), node = [...(pane?.querySelectorAll(".react-flow__node") ?? [])].find((item) => item.dataset.id === id);
    if (!node) return false; const a = pane.getBoundingClientRect(), b = node.getBoundingClientRect();
    return b.width > 60 && b.left >= a.left - 2 && b.right <= a.right + 2 && b.top >= a.top - 2 && b.bottom <= a.bottom + 2;
  }, selector, id);
  await until(() => run(() => document.querySelectorAll('[data-topology="service"] .react-flow__node').length === 20), "real declared services");
  const before = await transform();
  await click('[aria-label="Open file worker.ts"]');
  await until(() => run(() => document.querySelector(".cm-content")?.textContent.includes("graph camera proof")), "source editor after native click");
  await until(() => inView(serviceSelector, "service:19"), "source click reveals exact offscreen service");
  assert.notEqual(await transform(), before);
  // Opening source changes the graph group to its scrolling sidebar. Bring the
  // retained service panel into the visible window before native input there.
  await run(() => document.querySelector('[data-topology="service"] .graph-canvas').scrollIntoView({ block: "nearest" })); await frame();
  await run(() => document.querySelector('[data-topology="service"] [data-id="service:0"]').focus({ preventScroll: true }));
  wc.sendInputEvent({ type: "keyDown", keyCode: "Enter", modifiers: ["shift"] }); wc.sendInputEvent({ type: "keyUp", keyCode: "Enter", modifiers: ["shift"] });
  await until(() => inView(serviceSelector, "service:0"), "keyboard service reveal");
  // Native pointer gesture after reveal must survive a real declaration update.
  const beforePan = await transform();
  const p = await run(() => {
    const pane = document.querySelector('[data-topology="service"] .react-flow__pane'), r = pane.getBoundingClientRect();
    for (const [fx, fy] of [[.85, .8], [.85, .2], [.15, .2], [.5, .15]]) {
      const x = Math.round(r.left + r.width * fx), y = Math.round(r.top + r.height * fy);
      if (document.elementFromPoint(x, y) === pane) return { x, y };
    }
    throw new Error("No visible empty graph pane for native pan");
  });
  wc.sendInputEvent({ type: "mouseMove", ...p }); wc.sendInputEvent({ type: "mouseDown", ...p, button: "left", clickCount: 1 });
  wc.sendInputEvent({ type: "mouseMove", x: p.x + 35, y: p.y - 20, movementX: 35, movementY: -20 });
  wc.sendInputEvent({ type: "mouseUp", x: p.x + 35, y: p.y - 20, button: "left", clickCount: 1 }); await frame();
  const camera = await transform();
  assert.notEqual(camera, beforePan, "native pan did not move the viewport");
  const declaration = path.join(process.env.SWARM_RECENTER_FIXTURE, "service00", "service.swarm.json");
  const data = JSON.parse(await fs.readFile(declaration, "utf8")); data.service.displayName = "Renamed worker"; await fs.writeFile(declaration, JSON.stringify(data));
  await until(() => run(() => document.querySelector('[data-id="service:0"]')?.textContent.includes("Renamed worker")), "automatic declaration refresh"); await frame();
  assert.equal(await transform(), camera, "passive service update moved the user camera");
  await run(() => [...document.querySelectorAll('nav[aria-label="Component graph lenses"] button')].find((button) => button.textContent === "Build graph").click());
  await until(() => run(() => document.querySelectorAll('.build-canvas .react-flow__node').length === 24), "real Bazel query targets", 35000);
  const buildNode = '.build-canvas [data-id="//:target0"]';
  await click(buildNode);
  await until(() => inView(".build-canvas", "//:target0"), "native build-node reveal");
  assert.deepEqual(rendererErrors, []);
  await fs.writeFile(path.join(evidence, "graph-recenter.png"), (await wc.capturePage()).toPNG());
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, retained: true, rendererErrors, elapsedMs: Date.now() - started,
    gestures: ["native source click -> exact service", "native service keyboard -> node", "native pan retained across declaration edit", "native build click -> target"], source: "disposable committed Git repository; real service declarations and Bazel query" }, null, 2));
}
main().catch(async (error) => { await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ error: error.stack, rendererErrors }, null, 2)); });
