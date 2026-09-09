// TEST ONLY: native input over unchanged packaged main/preload/core. The shared
// observer only records request kinds; it never replaces transport responses.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const observeTransport = require("../task-integration/observe-transport.cjs");
const evidence = process.env.SWARM_DESIGN_TESTS_EVIDENCE;
const rendererErrors = [];
let stage = "startup";
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push({ stage, message: event.message }); });
  contents.on("render-process-gone", (_event, details) => rendererErrors.push({ stage, message: details.reason }));
});
require(path.join(process.env.SWARM_DESIGN_TESTS_PACKAGE, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 40000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await sleep(50); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now(), fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  await app.whenReady();
  assert.equal(app.getPath("userData"), process.env.SWARM_DESIGN_TESTS_PROFILE);
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned X11 selection");
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  assert(wc.getURL().startsWith(pathToFileURL(path.join(process.env.SWARM_DESIGN_TESTS_PACKAGE, "renderer/index.html")).href));
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const has = (selector) => run((selector) => Boolean(document.querySelector(selector)), selector);
  const text = (selector) => run((selector) => document.querySelector(selector)?.textContent ?? "", selector);
  const request = (body) => run((body) => window.swarm.request({ protocolVersion: 7, requestId: `design-proof:${crypto.randomUUID()}`, ...body }), body);
  const click = async (selector, exactText = null) => {
    await run((selector, exactText) => {
      const node = [...document.querySelectorAll(selector)].find((item) => exactText === null || item.textContent.trim() === exactText);
      if (!node || node.disabled) throw new Error(`Missing/disabled ${selector}: ${exactText}`);
      node.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, selector, exactText);
    await paint();
    const point = await run((selector, exactText) => {
      const node = [...document.querySelectorAll(selector)].find((item) => exactText === null || item.textContent.trim() === exactText);
      const rect = node.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      if (!rect.width || !rect.height || !node.contains(document.elementFromPoint(x, y))) throw new Error(`Occluded ${selector}: ${exactText}`);
      return { x, y };
    }, selector, exactText);
    const coordinates = { x: Math.round(point.x * wc.getZoomFactor()), y: Math.round(point.y * wc.getZoomFactor()) };
    wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...coordinates });
    wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...coordinates });
    await paint();
  };
  await run(() => {
    addEventListener("error", (event) => console.error(event.error?.stack ?? event.message));
    addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason));
  });
  win.focus(); wc.focus();
  const graph = '[aria-label="Component design canvas"]', targets = '[aria-label="Component targets"]';
  const selected = `${graph} .react-flow__node[data-id="${fixture.component.id}"]`;
  await until(() => has(selected), "real authored component graph");
  stage = "component-selection";
  await run((selector) => document.querySelector(selector).focus(), selected);
  wc.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
  wc.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
  await until(() => has(`${selected}.selected`), "selected component highlight");
  await click('[aria-label="Component design"] button', "Read design");
  await until(async () => (await text('[aria-label="Design document"] .design-prose')).includes("without a model"), "actual selected design document");
  await until(() => has(`${targets} [aria-label="Test //:passing_test"]:not(:disabled)`), "current Bazel test mapping");
  assert.match(await text(targets), new RegExp(fixture.component.title));
  assert.match(await text(`${targets} [aria-label="Tests"] h3`), /^Tests\b/);
  assert.match(await text(`${targets} [aria-label="Build targets"] h3`), /^Build targets\b/);
  for (const label of ["passing_test", "failing_test"]) assert(await has(`${targets} [aria-label="Test //:${label}"]`));
  for (const label of ["misleading-checks", "assets"]) {
    assert(await has(`${targets} [aria-label="Build //:${label}"]:not(:disabled)`));
    assert(!await has(`${targets} [aria-label="Test //:${label}"]`));
  }
  const world = await request({ type: "workspace.snapshot" }); assert(world.ok);
  assert.equal(world.snapshot.project.name, path.basename(fixture.root));
  const identity = { worldId: world.snapshot.world.id, repositoryId: world.snapshot.project.id };
  const before = await request({ ...identity, type: "build.observe" }); assert(before.ok);
  assert.equal(before.buildJobs.jobs.length, 0, "selection and Read design do not execute targets");
  const camera = () => run((selector) => document.querySelector(`${selector} .react-flow__viewport`)?.style.transform, graph);
  const originalCamera = await camera(); assert(originalCamera);
  await click(`${graph} .react-flow__controls-zoomout`);
  await until(async () => (await camera()) !== originalCamera, "deliberately adjusted graph camera");
  const retained = () => run((selector) => ({
    document: document.querySelector('[aria-label="Design document"]')?.textContent,
    visible: Boolean(document.querySelector('[aria-label="Design reading area"]:not([hidden])')),
    selected: document.querySelector(selector)?.classList.contains("selected"),
    breadcrumb: document.querySelector('[aria-label="Design breadcrumb"] [aria-current="page"]')?.textContent,
    camera: document.querySelector('[aria-label="Component design canvas"] .react-flow__viewport')?.style.transform,
  }), selected);
  const reading = await retained();
  assert(reading.selected && reading.visible && reading.breadcrumb === fixture.component.title && reading.camera);
  await fs.writeFile(path.join(evidence, "01-component-targets.png"), (await wc.capturePage()).toPNG());
  stage = "real-bazel-test";
  await click(`${targets} [aria-label="Test //:passing_test"]`);
  const jobSelector = '.resource-job[data-target-build-id]';
  await until(async () => (await text(jobSelector)).includes("Complete"), "actual Bazel test completion", 90000);
  assert.match(await text(jobSelector), /\/\/:passing_test/);
  assert.match(await text(`${jobSelector} header`), /Test/);
  assert.equal(await text(`${jobSelector} summary`), "Test output");
  await click(`${jobSelector} summary`);
  const observed = await request({ ...identity, type: "build.observe" }); assert(observed.ok);
  assert.equal(observed.buildJobs.jobs.length, 1);
  const job = observed.buildJobs.jobs[0];
  assert.equal(job.target, "//:passing_test"); assert.equal(job.operation, "test");
  assert.equal(job.status, "succeeded"); assert.equal(job.exitCode, 0); assert.equal(job.cleanup, "confirmed");
  assert.match(job.output, /\/\/:passing_test[^\n]*PASSED/);
  assert.equal(await text(`${jobSelector} .resource-build-output`), job.output);
  assert.deepEqual(await retained(), reading, "test action retains selected component and exact document");
  assert.equal(await fs.readFile(path.join(fixture.root, fixture.sourcePath), "utf8"), fixture.sourceText);
  const agents = await request({ type: "agent.snapshot" });
  assert(agents.ok && agents.agent.snapshot.runs.length === 0 && !agents.agent.snapshot.capabilities.controls.launch);
  const transport = observeTransport();
  assert(!transport.overflow && transport.generations === 1);
  assert.equal(transport.requests.filter((item) => item.type === "build.start").length, 1);
  assert(!transport.requests.some((item) => /^(agent\.(launch|steer|cancel)|trusted\.(start|launch|fork|send|decide)|externalAgents\.(send|handoff))$/.test(item.type)));
  assert.deepEqual(rendererErrors, []);
  await fs.writeFile(path.join(evidence, "02-real-test-complete.png"), (await wc.capturePage()).toPNG());
  await fs.writeFile(path.join(evidence, "design-tests-proof.json"), JSON.stringify({ ok: true, realBazel: true, packagedCore: true,
    component: fixture.component, job, ruleClassesDistinguished: true, selectionAndDocumentRetained: true,
    fixtureRuleClasses: ["fixture_test (test=True)", "fixture_binary (executable=True)", "filegroup"],
    modelTurns: 0, rendererErrors, transport, elapsedMs: Date.now() - started }, null, 2));
}
main().catch(async (error) => {
  await fs.writeFile(path.join(evidence, "design-tests-failure.json"), JSON.stringify({ stage, error: error.stack, rendererErrors }, null, 2));
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) await fs.writeFile(path.join(evidence, "failure.png"), (await win.webContents.capturePage()).toPNG());
});
