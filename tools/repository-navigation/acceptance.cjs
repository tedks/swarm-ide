// TEST ONLY. Load the unchanged archive main; all product data comes through its
// real packaged worker/preload. Native input starts only after X11 ownership proof.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const evidence = process.env.SWARM_NAVIGATION_EVIDENCE;
const packaged = process.env.SWARM_NAVIGATION_PACKAGE;
const rendererErrors = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push(event.message.slice(0, 4096)); });
  contents.on("render-process-gone", (_event, details) => rendererErrors.push(`Renderer gone: ${details.reason}`));
});
require(path.join(packaged, "app/electron/main.js"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await sleep(40); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now();
  const fixture = JSON.parse(await fs.readFile(path.join(evidence, "fixture.json"), "utf8"));
  await app.whenReady();
  assert.equal(app.getPath("userData"), process.env.SWARM_NAVIGATION_PROFILE);
  await until(() => fs.access(path.join(evidence, "window-selected")).then(() => true, () => false), "owned native window", 30000);
  const win = BrowserWindow.getAllWindows()[0]; assert(win && !win.isDestroyed());
  const wc = win.webContents;
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => {
    addEventListener("error", (event) => console.error(event.error?.stack ?? event.message));
    addEventListener("unhandledrejection", (event) => console.error(event.reason?.stack ?? event.reason));
    const report = console.error; console.error = (...args) => report(...args.map((value) => value instanceof Error ? value.stack : value));
  });
  const has = (selector) => run((s) => Boolean(document.querySelector(s)), selector);
  const label = (value) => `[aria-label=${JSON.stringify(value)}]`;
  const click = (selector) => run((s) => {
    const node = document.querySelector(s); if (!node || node.disabled) throw new Error(`Missing/disabled ${s}`);
    node.scrollIntoView({ block: "nearest" }); node.click();
  }, selector);
  const focus = (selector) => run((s) => {
    const node = document.querySelector(s); if (!node) throw new Error(`Missing focus ${s}`);
    node.scrollIntoView({ block: "nearest" }); node.focus();
  }, selector);
  const key = (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    if (keyCode === "Enter") wc.sendInputEvent({ type: "char", keyCode: "\r", modifiers });
    wc.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  };
  const fill = async (selector, value) => {
    await focus(selector); key("A", ["control"]);
    await until(() => run((s) => { const input = document.querySelector(s); return input.selectionStart === 0 && input.selectionEnd === input.value.length; }, selector), "native select-all");
    await wc.insertText(value);
    await until(() => run((s, v) => document.querySelector(s).value === v, selector, value), "exact native field value");
  };
  const request = (input) => run((body) => window.swarm.request({ protocolVersion: 5, requestId: `navigation-proof:${crypto.randomUUID()}`, ...body }), input);
  const snapshot = async () => { const result = await request({ type: "workspace.snapshot" }); assert(result.ok); return result.snapshot; };
  const observe = (world) => world.graphs.find((graph) => graph.topologyId === "repo").directory;
  const currentDirectory = () => run(() => document.querySelector("[data-topology='repo']")?.dataset.directory);
  const directory = (expected) => until(async () => await currentDirectory() === expected, `directory ${expected || '/'}`);
  const navText = () => run(() => document.querySelector("[aria-label='Repository navigation']")?.textContent ?? "");
  const viewport = (topology) => run((id) => document.querySelector(`[data-topology='${id}'] .react-flow__viewport`).style.transform, topology);
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const screenshot = async (name) => { await paint(); await fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG()); };
  const openPath = async (value) => {
    if (!await run(() => document.querySelector(".repository-open-path").open)) await click(".repository-open-path summary");
    await fill(label("Open repository path"), value); await click(".repository-open-path button[type='submit']");
  };
  win.focus(); wc.focus(); await until(() => win.isFocused() && wc.isFocused(), "owned native focus");
  await directory("");
  await until(() => has(label(`Enter directory ${fixture.directory}`)), "initial real root listing");
  assert(wc.getURL().startsWith(pathToFileURL(path.join(packaged, "renderer/index.html")).href));
  let world = await snapshot();
  assert.equal(world.project.name, path.basename(fixture.root), "project name comes from registered root");
  assert(!observe(world).entries.some((entry) => entry.path === ".git"), "Git administration omitted");
  const entryButtons = await run(() => [...document.querySelectorAll("[aria-label='Directory entries'] button")].map((node) => node.getAttribute("aria-label")));
  if (entryButtons.length > 1) {
    await focus(label(entryButtons[0])); key("Down");
    await until(() => run((expected) => document.activeElement?.getAttribute("aria-label") === expected, entryButtons[1]), "native entry-list arrow navigation");
  }
  await focus(label(`Enter directory ${fixture.directory}`)); key("Enter"); await directory(fixture.directory);
  await focus(label(`Open file ${fixture.sourcePath}`)); key("Enter");
  await until(() => has(".cm-content"), "actual source editor");
  await until(() => run((text) => document.querySelector(".cm-content").cmView.rootView.view.state.doc.toString() === text, fixture.sourceText), "exact source bytes");
  const sourceRead = await request({ type: "file.read", path: fixture.sourcePath });
  assert(sourceRead.ok && sourceRead.file.content === fixture.sourceText);
  const agent = await request({ type: "agent.snapshot" });
  assert(agent.ok && agent.agent.snapshot.runs.length === 0 && !agent.agent.snapshot.capabilities.controls.launch);
  const facts = ["actual archive main/preload/core", "actual committed repository root and directory activation", "native Enter opens exact source", "zero agent runs"];

  if (["invalid-name", "fingerprint-budget"].includes(fixture.kind)) {
    await until(async () => (await snapshot()).revisions.working.evidence === "unavailable", "unavailable initial working evidence");
    world = await snapshot();
    assert.equal(world.revisions.working.fingerprint, "");
    assert.notEqual(world.reconciliation.status, "green");
    assert(world.graphs.every((graph) => graph.reconciliation !== "green"));
    const sourceFocus = world.graphs.find((graph) => graph.topologyId === "repo").nodes.find((node) => node.focus.path === fixture.sourcePath).focus;
    const prepared = await request({ type: "agent.prepare", worldId: world.world.id, focus: sourceFocus,
      taskText: "Do not launch; unavailable evidence must reject preparation", model: null, effort: null,
      links: { parentRunId: null, task: null, spec: null } });
    assert(!prepared.ok && prepared.error.code === "STALE_CONTEXT", "unavailable working evidence denies context preparation");
    await focus(label("Repository Up")); key("Enter"); await directory("");
    if (fixture.kind === "invalid-name") {
      world = await snapshot();
      assert(observe(world).entries.some((entry) => entry.kind === "unsupported" && !entry.actionable && entry.path === null));
    }
    facts.push("separate initial fingerprint failure leaves browsing/read usable", "no fabricated digest, green, or agent context");
    await screenshot("01-degraded-navigation.png");
  } else {
    // Deliberately independent cameras. Every pointer gesture is completed.
    for (const topology of ["repo", "service"]) {
      const before = await viewport(topology);
      const point = await run((id) => { const rect = document.querySelector(`[data-topology='${id}'] .react-flow__pane`).getBoundingClientRect();
        return { x: Math.round(rect.x + rect.width * .65), y: Math.round(rect.y + rect.height * .65) }; }, topology);
      wc.sendInputEvent({ type: "mouseMove", ...point });
      wc.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 });
      wc.sendInputEvent({ type: "mouseMove", x: point.x + 31, y: point.y + 19, movementX: 31, movementY: 19 });
      wc.sendInputEvent({ type: "mouseUp", x: point.x + 31, y: point.y + 19, button: "left", clickCount: 1 });
      wc.sendInputEvent({ type: "mouseWheel", ...point, deltaY: -47, deltaX: 0 });
      await until(async () => await viewport(topology) !== before, `deliberate ${topology} camera`);
    }
    await focus(".cm-content"); key("End", ["control"]);
    await until(() => run(() => { const state = document.querySelector(".cm-content").cmView.rootView.view.state; return state.selection.main.anchor === state.doc.length; }), "source end");
    // Source already ends in a newline. Use the proven plain-text native append
    // gesture; Chromium's insertText API does not promise newline key semantics.
    await wc.insertText("// unsaved navigation intent"); key("Home", ["control"]); key("Right");
    await until(() => run(() => document.querySelector(".cm-content").cmView.rootView.view.state.selection.main.anchor === 1), "exact logical cursor");
    const dirtySource = `${fixture.sourceText}// unsaved navigation intent`;
    // Native keyboard activation is independent of the preceding graph drag's
    // browser click-suppression bookkeeping and exercises a first-class gesture.
    await focus(".agent-rail .agent-primary"); key("Enter");
    await until(() => has(".agent-draft textarea"), "independent draft");
    await fill(".agent-draft textarea", "Keep my source, my place, and this independent draft.");
    await paint();
    await run(() => { const editor = document.querySelector(".cm-content"); const state = editor.cmView.rootView.view.state;
      globalThis.__navigationProof = { editor, source: state.doc.toString(), anchor: state.selection.main.anchor, head: state.selection.main.head,
        draft: document.querySelector(".agent-draft textarea"), draftValue: document.querySelector(".agent-draft textarea").value,
        tabs: [...document.querySelectorAll(".surface-tab-main")],
        graphs: [...document.querySelectorAll(".react-flow")], serviceCamera: document.querySelector("[data-topology='service'] .react-flow__viewport").style.transform,
        repoCamera: document.querySelector("[data-topology='repo'] .react-flow__viewport").style.transform };
    });
    assert.equal(await run(() => globalThis.__navigationProof.source), dirtySource);
    const preserved = async (restoreRepo = false) => {
      assert.equal(await run((restore) => { const saved = globalThis.__navigationProof; const editor = document.querySelector(".cm-content");
        const state = editor.cmView.rootView.view.state;
        return saved.editor === editor && saved.source === state.doc.toString() && saved.anchor === state.selection.main.anchor && saved.head === state.selection.main.head &&
          saved.draft === document.querySelector(".agent-draft textarea") && saved.draftValue === document.querySelector(".agent-draft textarea").value &&
          saved.tabs.every((node) => node.isConnected) && saved.graphs.every((node, index) => node === document.querySelectorAll(".react-flow")[index]) &&
          saved.serviceCamera === document.querySelector("[data-topology='service'] .react-flow__viewport").style.transform &&
          (!restore || saved.repoCamera === document.querySelector("[data-topology='repo'] .react-flow__viewport").style.transform);
      }, restoreRepo), true, "exact dirty text/cursor/draft, graph identity, service camera and deliberate Back camera");
    };
    await focus(label("Repository Up")); key("Up", ["alt"]); await directory(""); await preserved();
    await focus(label("Repository Back")); key("Left", ["alt"]); await directory(fixture.directory); await paint(); await preserved(true);
    const beforeRefresh = observe(await snapshot()).observationId;
    const beforePositions = (await snapshot()).graphs.find((graph) => graph.topologyId === "repo").nodes.map(({ id, position }) => ({ id, position }));
    await click(label("Refresh directory"));
    await until(async () => observe(await snapshot()).observationId !== beforeRefresh, "refresh observation");
    assert.deepEqual((await snapshot()).graphs.find((graph) => graph.topologyId === "repo").nodes.map(({ id, position }) => ({ id, position })), beforePositions, "refresh retains surviving node positions");
    await preserved(true);
    for (const percent of [150, 100]) {
      if (percent === 150) { await click(label("Zoom in")); await until(() => wc.getZoomFactor() === 1.25, "zoom125"); await click(label("Zoom in")); }
      else await click(".zoom-value");
      await until(() => wc.getZoomFactor() === percent / 100, `zoom${percent}`);
      win.setSize(percent === 150 ? 1280 : 1480, percent === 150 ? 800 : 940); await paint(); await preserved(true);
      await screenshot(`02-source-retained-${percent}.png`);
    }
    await focus(label("Refresh directory"));
    await until(async () => (await navText()).toLowerCase().includes("stale"), "five-second explicit stale label", 10000);
    const staleId = observe(await snapshot()).observationId;
    await sleep(100); assert.equal(observe(await snapshot()).observationId, staleId, "stale timer does not rescan");
    await click(label("Refresh directory")); await until(async () => observe(await snapshot()).observationId !== staleId, "explicit refresh captures new observation");
    await preserved(true);
    facts.push("independent graph cameras", "exact dirty text/cursor/draft and graph DOM retained", "native Alt-Up/Alt-Left with Back camera restore", "100/150 zoom and resize do not refit", "stale state without rescans and explicit Refresh");

    if (fixture.kind === "unfamiliar") {
      await click(label("Repository root")); await directory(""); world = await snapshot();
      const entries = observe(world).entries;
      for (const [name, classification] of [[".hidden", "tracked"], ["untracked.txt", "untracked"], ["ignored.txt", "ignored"]])
        assert.equal(entries.find((entry) => entry.path === name)?.git, classification, `${name} real Git classification`);
      for (const [name, kind] of [["alias.ts", "symlink"], ["nested", "repository"], ["submodule", "repository"], ["pipe", "special"]]) {
        const entry = entries.find((candidate) => candidate.path === name); assert(entry && entry.kind === kind && !entry.actionable && entry.reason);
      }
      for (const badPath of [".git/config", "nested/secret.ts", "submodule/secret.ts", "alias.ts", "pipe"]) {
        const rejected = await request({ type: "file.read", path: badPath }); assert(!rejected.ok, `privileged open rejects ${badPath}`);
      }
      await click(label("Enter directory large")); await directory("large");
      let listing = observe(await snapshot());
      assert(!listing.complete && listing.capturedCount === 4096 && listing.entries.length === 200);
      const captureId = listing.observationId, captured = new Set(listing.entries.map((entry) => entry.path));
      await click(label("Next directory page")); await until(async () => observe(await snapshot()).page === 1, "ordinary next page");
      assert.equal(observe(await snapshot()).observationId, captureId);
      const offPage = observe(await snapshot()).entries[0].path;
      await click(label("Previous directory page")); await until(async () => observe(await snapshot()).page === 0, "ordinary previous page");
      await fill(label("Filter captured directory"), "no-such-captured-name"); key("Enter");
      await until(async () => observe(await snapshot()).filteredCount === 0, "captured-only filter");
      assert.equal(observe(await snapshot()).observationId, captureId);
      await openPath(offPage);
      await until(async () => { const observed = observe(await snapshot()); return observed.reveal?.path === offPage && observed.reveal?.status === "selected"; }, "captured offpage Reveal");
      assert.equal(observe(await snapshot()).page, 1);
      assert.equal(observe(await snapshot()).filter, "");
      assert.equal(observe(await snapshot()).observationId, captureId);
      for (let page = 1; page < listing.pageCount; page++) {
        const result = await request({ type: "repo.list", directory: "large", page, observationId: captureId, refresh: false, filter: "" });
        assert(result.ok); listing = result.repo.observation; listing.entries.forEach((entry) => captured.add(entry.path));
      }
      assert.equal(captured.size, 4096);
      const outside = Array.from({ length: 4120 }, (_, index) => `large/entry-${String(index).padStart(5, "0")}.txt`).find((name) => !captured.has(name));
      assert(outside, "outside-capture path established from actual full capture, not assumed filesystem order");
      await openPath(outside); await directory("large");
      await until(async () => (await navText()).includes("outside this partial directory capture"), "honest exact outside-capture notice");
      await until(() => run((expected) => document.querySelector(".source-surface header strong")?.textContent === expected, outside), "exact uncaptured path is actually active in editor");
      assert.equal((await request({ type: "file.read", path: outside })).ok, true);
      assert(!observe(await snapshot()).entries.some((entry) => entry.path === outside), "no invented graph node");
      // Re-open retained dirty source, then inspect task details while off-slice.
      await openPath(fixture.sourcePath); await directory("src");
      await until(() => run((expected) => document.querySelector(".cm-content").cmView.rootView.view.state.doc.toString() === expected, dirtySource), "return to exact retained dirty source");
      // Deliberate active-tab changes rebuild the existing editor by design;
      // assert logical restoration before taking its new DOM identity.
      assert.equal(await run(() => { const saved = globalThis.__navigationProof; const state = document.querySelector(".cm-content").cmView.rootView.view.state;
        return state.doc.toString() === saved.source && state.selection.main.anchor === saved.anchor && state.selection.main.head === saved.head && saved.tabs.every((node) => node.isConnected); }), true);
      await run(() => { globalThis.__navigationProof.editor = document.querySelector(".cm-content"); });
      await preserved();
      await click(label("Repository root")); await directory("");
      await until(() => has("[data-task-status='observed']"), "real Ditz task reference");
      await click(label("Select task navigation-reveal"));
      if (!await run(() => document.querySelector(".task-show-details").getBoundingClientRect().width > 0)) await click(label("Toggle work panel"));
      await focus(".task-show-details"); key("Enter"); await until(() => has(".task-detail .task-title"), "explicit task details");
      assert.equal(await currentDirectory(), "", "task details alone do not navigate");
      await click(label("Reveal working file src/main.ts at line 2")); await directory("src"); await preserved();
      await click(label("Repository root")); await directory("");
      const beforeDelete = observe(await snapshot()).observationId;
      await fs.unlink(path.join(fixture.root, "untracked.txt"));
      assert(observe(await snapshot()).entries.some((entry) => entry.path === "untracked.txt"), "retained dated observation before refresh");
      await click(label("Refresh directory")); await until(async () => observe(await snapshot()).observationId !== beforeDelete, "refresh after actual deletion");
      assert(!observe(await snapshot()).entries.some((entry) => entry.path === "untracked.txt"));
      await preserved();
      facts.push("actual Git tracked/untracked/ignored/hidden and nonactionable filesystem boundaries", "ordinary page/filter and captured offpage Reveal reuse observation", "all 4096 captured entries paged without recapture", "exact uncaptured path opens with truthful notice", "real CLI task details stable then explicit off-slice Reveal", "actual deletion requires explicit refresh");
      await screenshot("03-unfamiliar-boundaries.png");
    }
    assert.equal(await fs.readFile(path.join(fixture.root, fixture.sourcePath), "utf8"), fixture.sourceText, "dirty editor never wrote disk");
  }
  const lastAgent = await request({ type: "agent.snapshot" });
  assert(lastAgent.ok && lastAgent.agent.snapshot.runs.length === 0 && !lastAgent.agent.snapshot.capabilities.controls.launch);
  await paint(); assert.deepEqual(rendererErrors, [], "any renderer exception fails even if final state recovered");
  await fs.writeFile(path.join(evidence, "navigation-proof.json"), JSON.stringify({ ok: true, case: fixture.kind, realFilesystem: true,
    packagedCore: true, sourceCommit: fixture.sourceCommit, committedHead: fixture.committedHead, sourcePath: fixture.sourcePath,
    modelTurns: 0, rendererErrors, facts, elapsedMs: Date.now() - started }, null, 2));
}
main().catch(async (error) => {
  const message = `${error.message}\n${error.stack}`; console.error(message);
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    await fs.writeFile(path.join(evidence, "failure-window.png"), (await win.webContents.capturePage()).toPNG());
    console.error(await win.webContents.executeJavaScript(`JSON.stringify({active:document.activeElement?.outerHTML,body:document.querySelector('#root')?.textContent?.slice(0,3000)})`));
  }
  await fs.writeFile(path.join(evidence, "navigation-failure.json"), JSON.stringify({ ok: false, message, rendererErrors }));
});
