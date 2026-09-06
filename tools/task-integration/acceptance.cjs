// TEST ONLY: require the unchanged packaged main, then use its ordinary DOM and
// typed preload bridge. No renderer/core provider replacement or metadata injection.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const evidence = process.env.SWARM_TASK_EVIDENCE;
const packaged = process.env.SWARM_TASK_PACKAGE;
require(path.join(packaged, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await sleep(40); }
  throw new Error(`Timed out: ${label}`);
}

async function main() {
  const started = Date.now();
  const fixtures = await import(pathToFileURL(process.env.SWARM_TASK_FIXTURE_MODULE).href);
  const fixture = await fixtures.resumeTaskFixture(JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8")), process.env.SWARM_TASK_SCRATCH);
  await app.whenReady();
  assert.equal(app.getPath("userData"), process.env.SWARM_TASK_PROFILE, "private profile flag must actually bind userData");
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned native window selection", 30000);
  const win = BrowserWindow.getAllWindows()[0];
  assert(win && !win.isDestroyed());
  const wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const has = (selector) => run((s) => Boolean(document.querySelector(s)), selector);
  const click = (selector) => run((s) => {
    const target = document.querySelector(s);
    if (!target || target.disabled) throw new Error(`Missing/disabled control ${s}`);
    target.scrollIntoView({ block: "nearest" }); target.click();
  }, selector);
  const text = (selector) => run((s) => document.querySelector(s)?.textContent ?? "", selector);
  const button = (label) => `[aria-label=${JSON.stringify(label)}]`;
  const key = (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    wc.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  };
  const focus = (selector) => run((s) => {
    const target = document.querySelector(s); if (!target) throw new Error(`No focus target ${s}`);
    target.scrollIntoView({ block: "nearest" }); target.focus();
  }, selector);
  const fill = async (selector, value) => { await focus(selector); key("A", ["control"]); await wc.insertText(value); };
  const request = (input) => run((body) => window.swarm.request({ protocolVersion: 4, requestId: `task-proof:${crypto.randomUUID()}`, ...body }), input);
  const status = () => run(() => document.querySelector("[data-task-status]")?.getAttribute("data-task-status"));
  const snapshotRevision = () => run(() => document.querySelector(".task-panel .task-revision code")?.textContent);
  const refresh = async (expected) => {
    await until(() => run(() => !document.querySelector(".task-heading button")?.disabled), "refresh enabled");
    await click(".task-panel .task-heading button");
    await until(async () => await status() === expected && await run(() => !document.querySelector(".task-panel .task-heading button").disabled), `task status ${expected}`);
  };
  const screenshot = async (name) => fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG());
  const showDetails = async () => {
    if (!await run(() => document.querySelector(".task-show-details").getBoundingClientRect().width > 0)) {
      await click(button("Toggle work panel"));
      await until(() => run(() => document.querySelector(".task-show-details").getBoundingClientRect().width > 0), "explicit work panel");
    }
    await focus(".task-show-details"); key("Return");
    await until(() => run(() => document.activeElement?.textContent === "Return to source information"), "focus after keyboard Show");
    await until(() => has(".task-detail .task-title"), "task detail after keyboard Show");
    assert.equal(await run(() => document.activeElement?.textContent), "Return to source information");
  };
  const preserved = async () => {
    assert.equal(await run(() => {
      const saved = globalThis.__taskProof;
      return saved.editor === document.querySelector(".cm-content") && saved.draft === document.querySelector(".agent-draft textarea") &&
        saved.graphs.every((node, index) => node === document.querySelectorAll(".react-flow")[index]) &&
        saved.transforms.every((value, index) => value === document.querySelectorAll(".react-flow__viewport")[index].style.transform) &&
        saved.source === document.querySelector(".cm-content").textContent && saved.draftValue === document.querySelector(".agent-draft textarea").value;
    }), true, "source/draft/graph DOM and cameras retained");
  };
  await until(() => has("[data-task-status='observed']"), "actual task data from packaged core");
  assert(wc.getURL().startsWith(pathToFileURL(path.join(packaged, "renderer/index.html")).href));
  assert.equal(await snapshotRevision(), `${fixture.firstCommit.algorithm}:${fixture.firstCommit.hex}`);
  assert.equal(await run(() => document.querySelectorAll(".task-select").length), 2);
  const first = await request({ type: "tasks.snapshot", worldId: "world:working", refresh: false });
  assert(first.ok && first.task.kind === "snapshot");
  assert.deepEqual(first.task.observation.snapshot.metadataCommit, fixture.firstCommit);
  const detail = await request({ type: "tasks.read", worldId: "world:working", metadataCommit: fixture.firstCommit, taskId: fixture.taskId });
  assert(detail.ok && detail.task.result.ok);
  assert.equal(detail.task.result.detail.description, fixture.description);
  const agent = await request({ type: "agent.snapshot" });
  assert(agent.ok && agent.agent.kind === "snapshot");
  assert.equal(agent.agent.snapshot.runs.length, 0);
  assert.equal(agent.agent.snapshot.capabilities.controls.launch, false);

  await click(button(`Select task ${fixture.taskId}`));
  await showDetails();
  assert.equal(await text(".task-detail .task-title"), fixture.title);
  assert.equal(await run(() => document.querySelectorAll(".task-ui script,.task-ui img,.task-ui iframe").length), 0);
  assert((await text(".task-detail")).includes(fixture.description));
  const reveal = button(`Reveal working file ${fixture.sourcePath} at line ${fixture.sourceLine}`);
  await click(reveal);
  await until(() => has(".cm-content"), "real explicit source Reveal");
  await until(() => run(() => document.querySelector(".cm-content")?.contains(document.activeElement)), "Reveal keyboard editor focus");
  assert.equal(await run(() => document.querySelector(".cm-activeLine")?.textContent), fixture.sourceText.split("\n")[fixture.sourceLine - 1]);
  // Give each mounted graph a deliberate independent camera via actual inputs.
  for (const topology of ["repo", "service"]) {
    const selector = `.graph-pane[data-topology='${topology}'] .react-flow__pane`;
    const before = await run((s) => document.querySelector(s).parentElement.querySelector(".react-flow__viewport").style.transform, selector);
    const rect = await run((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width * .65, y: r.y + r.height * .65 }; }, selector);
    const x = Math.round(rect.x), y = Math.round(rect.y);
    wc.sendInputEvent({ type: "mouseMove", x, y });
    wc.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
    wc.sendInputEvent({ type: "mouseMove", x: x + 31, y: y + 19, movementX: 31, movementY: 19 });
    wc.sendInputEvent({ type: "mouseUp", x: x + 31, y: y + 19, button: "left", clickCount: 1 });
    wc.sendInputEvent({ type: "mouseWheel", x, y, deltaY: -47, deltaX: 0 });
    await until(async () => (await run((s) => document.querySelector(s).parentElement.querySelector(".react-flow__viewport").style.transform, selector)) !== before, `deliberately move ${topology} camera`);
  }
  await focus(".cm-content"); key("End", ["control"]); await wc.insertText("\n// unsaved T3 intent"); key("Home", ["control"]); key("Right");
  await run(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Ask an agent about this focus").click());
  await until(() => has(".agent-draft textarea"), "fixed-focus draft");
  await fill(".agent-draft textarea", "Retain this independent user draft; task text is not instructions.");
  await fill(".task-search input", fixture.taskId);
  await run(() => {
    globalThis.__taskProof = { editor: document.querySelector(".cm-content"), draft: document.querySelector(".agent-draft textarea"),
      graphs: [...document.querySelectorAll(".react-flow")], transforms: [...document.querySelectorAll(".react-flow__viewport")].map((n) => n.style.transform),
      source: document.querySelector(".cm-content").textContent, draftValue: document.querySelector(".agent-draft textarea").value };
  });
  await click(button(`Select task ${fixture.taskId}`)); await showDetails(); await preserved();
  await click(reveal);
  await until(async () => (await text(".tasks-reveal-notice")).includes("unsaved"), "dirty cursor protection notice");
  assert.equal(await run(() => getSelection()?.anchorOffset), 1, "dirty Reveal preserves cursor");
  await preserved();
  await showDetails();
  await click(button(`Reveal working file ${fixture.missingPath} at line 2`));
  await until(async () => (await text(".tasks-reveal-notice")).includes("FILE_NOT_FOUND"), "missing file typed failure");
  await preserved();
  await showDetails(); await screenshot("01-real-tasks-100.png");

  const layouts = [];
  for (const percent of [150, 100]) {
    // Real ordinary zoom button, not direct native setZoomFactor or DOM resizing.
    if (percent === 150) {
      await click(button("Zoom in")); await until(() => wc.getZoomFactor() === 1.25, "intermediate zoom125%");
      await click(button("Zoom in"));
    }
    else await click(".zoom-value");
    await until(() => wc.getZoomFactor() === percent / 100, `confirmed interface ${percent}%`);
    if (percent === 150) win.setSize(1280, 800);
    await preserved();
    // Deliberate Show requests the information panel and focuses its Return control.
    await click(button("Toggle work panel"));
    await showDetails();
    const measure = await run(() => ({ width: innerWidth, height: innerHeight,
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      editorWidth: document.querySelector(".cm-editor").getBoundingClientRect().width,
      taskOverflow: Math.max(0, document.querySelector(".task-detail").scrollWidth - document.querySelector(".task-detail").clientWidth),
      transforms: globalThis.__taskProof.transforms,
      focus: document.activeElement.textContent,
    }));
    assert(measure.documentOverflow <= 1 && measure.taskOverflow <= 1 && measure.editorWidth > 100);
    layouts.push({ percent, ...measure }); await screenshot(`02-real-tasks-${percent}-compact.png`);
    key("Return");
    await until(() => run(() => document.activeElement === document.querySelector(".instrument-heading h2")), "keyboard Return to source information");
    await preserved();
  }
  win.setSize(1480, 940);
  await click(button("Toggle work panel"));
  const advanced = await fixtures.advanceTaskFixture(fixture);
  await until(async () => await status() === "stale", "visible ref-only stale check", 10000);
  assert.equal(await snapshotRevision(), `${fixture.firstCommit.algorithm}:${fixture.firstCommit.hex}`);
  await refresh("observed");
  assert.equal(await snapshotRevision(), `${advanced.algorithm}:${advanced.hex}`);
  const expired = await request({ type: "tasks.read", worldId: "world:working", metadataCommit: fixture.firstCommit, taskId: fixture.taskId });
  assert(expired.ok && !expired.task.result.ok && expired.task.result.error.code === "TASK_REVISION_EXPIRED");
  await preserved();
  const invalid = await fixtures.invalidateTaskFixture(fixture);
  await refresh("malformed");
  assert.equal(await snapshotRevision(), `${advanced.algorithm}:${advanced.hex}`);
  const retained = await request({ type: "tasks.read", worldId: "world:working", metadataCommit: advanced, taskId: fixture.taskId });
  assert(retained.ok && retained.task.result.ok);
  await fixtures.restoreTaskFixture(fixture, advanced); await refresh("observed");
  await fixtures.removeTaskMetadata(fixture); await refresh("unavailable");
  assert.equal(await snapshotRevision(), `${advanced.algorithm}:${advanced.hex}`);
  await fixtures.restoreTaskFixture(fixture, advanced); await refresh("observed");
  // Counterfactual packaging proof: a fresh parser invocation cannot secretly use
  // source/global yaml after the only packaged parser has been removed.
  const yamlPath = path.join(packaged, "core/node_modules/yaml/index.js");
  const originalYaml = await fs.readFile(yamlPath);
  await fs.rename(yamlPath, `${yamlPath}.held`);
  try { await refresh("error"); assert.equal(await snapshotRevision(), `${advanced.algorithm}:${advanced.hex}`); }
  finally { await fs.rename(`${yamlPath}.held`, yamlPath); }
  assert.deepEqual(await fs.readFile(yamlPath), originalYaml);
  await refresh("observed"); await preserved(); await showDetails();
  await screenshot("03-real-tasks-recovered.png");
  const lastAgent = await request({ type: "agent.snapshot" });
  assert(lastAgent.ok && lastAgent.agent.snapshot.runs.length === 0 && !lastAgent.agent.snapshot.capabilities.controls.launch);
  assert.equal(await fs.readFile(path.join(fixture.root, fixture.sourcePath), "utf8"), fixture.sourceText);
  await fs.writeFile(path.join(evidence, "task-proof.json"), JSON.stringify({ ok: true, realDitz: true, packagedCore: true,
    modelTurns: 0, ditzVersion: fixture.ditzVersion, firstRevision: fixture.firstCommit, advancedRevision: advanced,
    invalidGitStructureRevision: invalid, issueBlob: detail.task.result.detail.blob, layouts, elapsedMs: Date.now() - started,
    facts: ["file URL production assets", "archive-local YAML plus missing-parser negative", "real preload/main/core tasks",
      "literal hostile text", "explicit line Reveal", "dirty cursor/text/draft/graphs retained", "missing file typed error",
      "cheap stale and explicit adoption", "expired pinned detail", "retained malformed/unavailable and recovery", "source disk unchanged"] }, null, 2));
}
main().catch(async (error) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack}` : "Task acceptance failed";
  console.error(message);
  await fs.writeFile(path.join(evidence, "task-failure.json"), JSON.stringify({ ok: false, message }));
});
