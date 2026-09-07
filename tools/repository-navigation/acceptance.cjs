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
const rendererErrorStages = [];
let stage = "startup";
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => { if (event.level === "error") {
    rendererErrors.push(event.message.slice(0, 4096)); rendererErrorStages.push({ stage, message: event.message.slice(0, 4096) });
  } });
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
  await run(() => {
    const events = [];
    const record = (phase) => (event) => { events.push({ at: performance.now(), phase, target: event.target?.getAttribute?.("aria-label") ?? event.target?.className }); if (events.length > 64) events.shift(); };
    window.addEventListener("click", record("window-capture"), true);
    document.addEventListener("click", record("document-capture"), true);
    window.addEventListener("click", record("window-bubble"));
    globalThis.__navigationClickTrace = events;
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
    await focus(selector);
    await until(() => run((s) => document.activeElement === document.querySelector(s), selector), "visible field focused");
    key("A", ["control"]);
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
    if (!await run(() => document.querySelector(".repository-options").open)) await click(".repository-options > summary");
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
  const contextSubject = () => run(() => document.querySelector(".artifact-context")?.dataset.contextSubject);
  const contextText = (section) => run((id) => document.querySelector(`[data-context-section='${id}']`)?.textContent ?? "", section);
  await until(async () => await contextSubject() === fixture.sourcePath, "Q1 exact foreground source attention");
  assert((await contextText("source-read")).includes(sourceRead.file.revision), "Q1 broker source receipt hash, not build revision");
  const agent = await request({ type: "agent.snapshot" });
  assert(agent.ok && agent.agent.snapshot.runs.length === 0 && !agent.agent.snapshot.capabilities.controls.launch);
  const facts = ["actual archive main/preload/core", "actual committed repository root and directory activation", "native Enter opens exact source", "zero agent runs"];
  facts.push("Q1 exact foreground file identity and actual broker content receipt");

  if (fixture.kind === "swarm") {
    stage = "q1-real-service-context";
    await until(async () => !(await snapshot()).jobs.some((job) => job.status === "running"), "initial topology attempt settled", 90000);
    if ((await snapshot()).reconciliation.status !== "green") {
      await click("#reconcile-success");
      await until(async () => (await snapshot()).reconciliation.status === "green", "actual package Bazel service artifact", 90000);
    }
    const built = await snapshot();
    assert.equal(built.serviceContext?.status, "observed");
    assert.equal(built.serviceContext.repositoryId, built.project.id);
    assert.equal(built.serviceContext.buildId, built.revisions.built.id);
    assert(!(await contextText("services")).includes("Implementation member of"), "ordinary core/files.ts must not inherit FraudCheck ownership");
    assert((await contextText("services")).includes("other service coverage unavailable"));
    await screenshot("q1-ordinary-source.png");
    const implementation = "examples/checkout-world/services/fraudcheck/fraudcheck.ts";
    const provided = "examples/checkout-world/services/fraudcheck/fraudcheck.proto";
    const required = "examples/checkout-world/services/payments/payments.proto";
    const inspected = [];
    for (const [file, relation, owns] of [[implementation, "Implementation member of", true], [provided, "Declares provided interface", true], [required, "Declares required interface", false]]) {
      await openPath(file); await until(async () => await contextSubject() === file, `Q1 inspected ${file}`);
      const bytes = await fs.readFile(path.join(fixture.root, file), "utf8");
      assert.equal(await run(() => document.querySelector(".cm-content").cmView.rootView.view.state.doc.toString()), bytes);
      const serviceText = await contextText("services");
      assert(serviceText.includes(relation)); assert.equal(serviceText.includes("Implementation member of"), owns);
      inspected.push({ file, relation, owns, serviceText });
      await screenshot(`q1-${path.basename(file)}.png`);
    }
    const beforeLink = await contextSubject();
    await click("[data-topology='service'] .react-flow__node[data-id='service:fraud-check']");
    await until(async () => await contextSubject() === "service:fraud-check", "explicit graph inspection owns Context while source stays visible");
    assert.equal(await run(() => document.querySelector(".source-surface header strong").textContent), beforeLink);
    await run((destination) => {
      const link = [...document.querySelectorAll("[data-context-section='services'] .source-link")].find((node) => node.textContent.includes(destination));
      if (!link) throw new Error("Missing actual required-declaration link"); link.click();
    }, "Payments.Authorize");
    await until(async () => await contextSubject() === required, "explicit built declaration link opens current real source");
    stage = "q1-retained-failed-publication";
    const manifestPath = path.join(fixture.root, "examples/checkout-world/services/fraudcheck/service.swarm.json");
    const manifestBytes = await fs.readFile(manifestPath);
    try {
      await fs.writeFile(manifestPath, "{ intentionally invalid owned-test manifest\n");
      await until(async () => (await snapshot()).revisions.working.fingerprint !== built.revisions.working.fingerprint, "actual working change observed");
      const epoch = (await snapshot()).reconciliation.epoch;
      await click("#reconcile-success");
      await until(async () => { const next = await snapshot(); return next.reconciliation.epoch > epoch && next.reconciliation.status === "red"; }, "actual Bazel failure retains old publication", 90000);
      assert.deepEqual((await snapshot()).serviceContext, built.serviceContext, "failed publication preserves exact original context evidence");
      assert.equal(await run(() => document.querySelector("[data-context-section='services'] [data-context-freshness]")?.textContent), "retained");
      await screenshot("q1-retained-failure.png");
    } finally { await fs.writeFile(manifestPath, manifestBytes); }
    await openPath(fixture.sourcePath); await until(async () => await contextSubject() === fixture.sourcePath, "return ordinary source attention");
    await directory(fixture.directory);
    await fs.writeFile(path.join(evidence, "q1-context-proof.json"), JSON.stringify({ buildId: built.revisions.built.id, sourceFingerprint: built.revisions.built.sourceFingerprint, inspected, declarationLinkOpened: true, rendererErrors: [] }, null, 2));
    facts.push("Q1 actual Bazel artifact, ordinary/implementation/provided/required distinction, explicit declaration link, graph inspection without source activation", "Q1 actual owned manifest build failure retains original build identity and historical relationships");
  } else {
    assert((await contextText("services")).includes("unavailable"), "unfamiliar/degraded repository does not invent service facts");
    assert((await contextText("capture")).includes("No bounded registered capture"));
  }

  if (["invalid-name", "fingerprint-budget"].includes(fixture.kind)) {
    const failureReason = fixture.kind === "invalid-name" ? "not valid UTF-8" : "exceeds the fingerprint bound";
    // Registration begins unavailable. It is not proof that the independent
    // observer actually attempted and reported this particular failed input.
    await until(async () => { const current = await snapshot(); return current.revisions.working.evidence === "unavailable" &&
      current.reconciliation.status === "red" && current.reconciliation.message.includes(failureReason); }, `observed ${fixture.kind} failure with exact reason`);
    world = await snapshot();
    assert.equal(world.revisions.working.fingerprint, "");
    assert.equal(world.reconciliation.status, "red");
    assert(world.reconciliation.message.includes(failureReason));
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
    stage = "pan-independent-cameras";
    // Deliberately independent cameras. Every pointer gesture is completed.
    for (const topology of ["repo", "service"]) {
      let previous, stableAt = Date.now();
      await until(async () => { const value = await viewport(topology); if (value !== previous) { previous = value; stableAt = Date.now(); } return Date.now() - stableAt >= 300; }, "initial camera settled");
      const before = await viewport(topology);
      const point = await run((id) => {
        const pane = document.querySelector(`[data-topology='${id}'] .react-flow__pane`), rect = pane.getBoundingClientRect();
        for (const fy of [.02, .98, .05, .95, .2, .8, .5]) for (const fx of [.02, .98, .05, .95, .2, .8, .5]) {
          const x = Math.round(rect.x + rect.width * fx), y = Math.round(rect.y + rect.height * fy);
          if (document.elementFromPoint(x, y) === pane) return { x, y };
        }
        throw new Error(`No visible blank ${id} pane point`);
      }, topology);
      wc.sendInputEvent({ type: "mouseMove", ...point });
      wc.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 });
      wc.sendInputEvent({ type: "mouseMove", x: point.x + 31, y: point.y + 19, movementX: 31, movementY: 19 });
      wc.sendInputEvent({ type: "mouseUp", x: point.x + 31, y: point.y + 19, button: "left", clickCount: 1 });
      await until(async () => await viewport(topology) !== before, `deliberate ${topology} camera`);
    }
    stage = "dirty-source-and-draft";
    await focus(".cm-content"); key("End", ["control"]);
    await until(() => run(() => { const state = document.querySelector(".cm-content").cmView.rootView.view.state; return state.selection.main.anchor === state.doc.length; }), "source end");
    // Source already ends in a newline. Use the proven plain-text native append
    // gesture; Chromium's insertText API does not promise newline key semantics.
    await wc.insertText("// unsaved navigation intent"); key("Home", ["control"]); key("Right");
    await until(() => run(() => document.querySelector(".cm-content").cmView.rootView.view.state.selection.main.anchor === 1), "exact logical cursor");
    const dirtySource = `${fixture.sourceText}// unsaved navigation intent`;
    // d3 installs a temporary window-capture click blocker after native pan.
    // A recorded failure showed Ask stopped before document dispatch. Observe
    // the actual gesture's completion; do not remove listeners or retry a click.
    await until(() => run(() => !(window.__on ?? []).some(({ type, name }) =>
      (type === "click" && name === "drag") || (type === "mouseup" && name === "zoom"))), "native graph drag completion", 2000);
    // This setup button uses the same ordinary DOM click as Refresh/zoom. The
    // keyboard acceptance belongs to repository entry/Up/Back and source edits;
    // no provider, draft store or renderer state is injected here.
    await click(".agent-rail .agent-primary");
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
    // N2: ordinary keyboard UI over the real packaged name provider. These
    // variables inspect DOM identity; no product state or metadata is injected.
    const search = async (query) => {
      key("K", ["control"]); await until(() => has(label("Workspace command")), "filename palette");
      await fill(label("Workspace command"), query);
      await until(() => run(() => document.querySelector(".file-search-status")?.textContent.includes("Git name inventory")), "real filename capture");
    };
    const searchPaths = () => run(() => [...document.querySelectorAll("[data-file-search-path]")].map((node) => node.dataset.fileSearchPath));
    const closeSearch = async () => { key("Escape"); await until(async () => !await has(".command-palette"), "Escape cancels search"); };
    const returnSource = async () => {
      await click(`.surface-tab-main[title=${JSON.stringify(fixture.sourcePath)}]`);
      await until(() => run((expected) => document.querySelector(".cm-content")?.cmView.rootView.view.state.doc.toString() === expected, dirtySource), "search return retains dirty bytes");
      assert.equal(await run(() => { const saved = globalThis.__navigationProof, state = document.querySelector(".cm-content").cmView.rootView.view.state;
        return state.selection.main.anchor === saved.anchor && state.selection.main.head === saved.head; }), true, "search return retains logical cursor");
      await run(() => { globalThis.__navigationProof.editor = document.querySelector(".cm-content"); });
      await preserved();
    };
    stage = "file-search-keyboard";
    await focus(".agent-draft textarea");
    await search(fixture.searchPath);
    assert((await searchPaths()).includes(fixture.searchPath));
    await preserved(true); assert.equal(await currentDirectory(), fixture.directory, "search typing never navigates");
    key("Down"); await preserved(true); await closeSearch();
    await until(() => run(() => document.activeElement === globalThis.__navigationProof.draft), "Escape restores prior draft focus");
    await preserved(true);
    await search("same-match.ts");
    assert.deepEqual(await searchPaths(), ["search-proof/a/same-match.ts", "search-proof/b/same-match.ts"]);
    await screenshot("04-file-search-results.png");
    key("Down"); key("Enter"); await directory("search-proof/b");
    await until(() => run(() => document.querySelector(".source-surface header strong")?.textContent === "search-proof/b/same-match.ts"), "highlighted duplicate opens exact full path");
    assert.equal(await run(() => document.querySelector(".cm-content").cmView.rootView.view.state.doc.toString()), await fs.readFile(path.join(fixture.root, "search-proof/b/same-match.ts"), "utf8"));
    await returnSource();
    await search("[*] $(not-command)"); assert.deepEqual(await searchPaths(), ["search-proof/literal [*] $(not-command).txt"]); await closeSearch();
    await search(".dot-match"); assert.deepEqual(await searchPaths(), ["search-proof/.dot-match"]); await closeSearch();
    await search("untracked-match"); assert.deepEqual(await searchPaths(), ["search-proof/untracked-match.txt"]); await closeSearch();
    await search("no-such-filename-n2"); assert.deepEqual(await searchPaths(), []);
    assert(await run(() => document.querySelector(".file-search-empty")?.textContent.includes("captured inventory"))); await closeSearch();
    // Return to the original directory and its deliberate saved camera, using
    // explicit navigation rather than pretending file search never navigates.
    await focus(label("Repository Back")); key("Left", ["alt"]); await directory(fixture.directory); await paint(); await preserved(true);
    facts.push("N2 real tracked/untracked/dot/literal filename search beyond loaded slice", "N2 duplicate basename keyboard selection opens exact source", "N2 typing/highlight/Escape preserve focus/source/draft/graph cameras");
    stage = "up-back-refresh";
    await focus(label("Repository Up")); key("Up", ["alt"]); await directory(""); await preserved();
    await focus(label("Repository Back")); key("Left", ["alt"]); await directory(fixture.directory); await paint(); await preserved(true);
    const beforeRefresh = observe(await snapshot()).observationId;
    const beforePositions = (await snapshot()).graphs.find((graph) => graph.topologyId === "repo").nodes.map(({ id, position }) => ({ id, position }));
    await click(label("Refresh directory"));
    await until(async () => observe(await snapshot()).observationId !== beforeRefresh, "refresh observation");
    assert.deepEqual((await snapshot()).graphs.find((graph) => graph.topologyId === "repo").nodes.map(({ id, position }) => ({ id, position })), beforePositions, "refresh retains surviving node positions");
    await preserved(true);
    for (const percent of [150, 100]) {
      stage = `interface-zoom-${percent}`;
      if (percent === 150) { await click(label("Zoom in")); await until(() => wc.getZoomFactor() === 1.25, "zoom125"); await click(label("Zoom in")); }
      else await click(".zoom-value");
      await until(() => wc.getZoomFactor() === percent / 100, `zoom${percent}`);
      win.setSize(percent === 150 ? 1280 : 1480, percent === 150 ? 800 : 940); await paint(); await preserved(true);
      stage = `file-search-${percent}`;
      await search(fixture.searchPath); await preserved(true); key("Enter");
      await directory(fixture.searchPath.split("/").slice(0, -1).join("/"));
      await until(() => run((expected) => document.querySelector(".cm-content")?.cmView.rootView.view.state.doc.toString() === expected, fixture.searchText), "off-slice search opens real source at interface zoom");
      await returnSource();
      await focus(label("Repository Back")); key("Left", ["alt"]); await directory(fixture.directory); await paint(); await preserved(true);
      await screenshot(`02-source-retained-${percent}.png`);
    }
    stage = "stale-refresh";
    await focus(label("Refresh directory"));
    await until(async () => (await navText()).toLowerCase().includes("stale"), "five-second explicit stale label", 10000);
    const staleId = observe(await snapshot()).observationId;
    await sleep(100); assert.equal(observe(await snapshot()).observationId, staleId, "stale timer does not rescan");
    await click(label("Refresh directory")); await until(async () => observe(await snapshot()).observationId !== staleId, "explicit refresh captures new observation");
    await preserved(true);
    facts.push("independent graph cameras", "exact dirty text/cursor/draft and graph DOM retained", "native Alt-Up/Alt-Left with Back camera restore", "100/150 zoom and resize do not refit", "stale state without rescans and explicit Refresh");

    if (fixture.kind === "unfamiliar") {
      stage = "filesystem-boundaries";
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
      stage = "large-first-page";
      await click(label("Enter directory large")); await directory("large");
      let listing = observe(await snapshot());
      assert(!listing.complete && listing.capturedCount === 4096 && listing.entries.length === 200);
      const captureId = listing.observationId, captured = new Set(listing.entries.map((entry) => entry.path));
      stage = "large-page-filter-reveal";
      await click(label("Next directory page")); await until(async () => observe(await snapshot()).page === 1, "ordinary next page");
      assert.equal(observe(await snapshot()).observationId, captureId);
      const offPage = observe(await snapshot()).entries[0].path;
      await click(label("Previous directory page")); await until(async () => observe(await snapshot()).page === 0, "ordinary previous page");
      if (!await run(() => document.querySelector(".repository-options").open)) await click(".repository-options > summary");
      await fill(label("Filter captured directory"), "no-such-captured-name"); key("Enter");
      await until(async () => observe(await snapshot()).filteredCount === 0, "captured-only filter");
      assert.equal(observe(await snapshot()).observationId, captureId);
      await openPath(offPage);
      await until(async () => { const observed = observe(await snapshot()); return observed.reveal?.path === offPage && observed.reveal?.status === "selected"; }, "captured offpage Reveal");
      assert.equal(observe(await snapshot()).page, 1);
      assert.equal(observe(await snapshot()).filter, "");
      assert.equal(observe(await snapshot()).observationId, captureId);
      stage = "large-capture-enumeration";
      for (let page = 1; page < listing.pageCount; page++) {
        const result = await request({ type: "repo.list", directory: "large", page, observationId: captureId, refresh: false, filter: "" });
        assert(result.ok); listing = result.repo.observation; listing.entries.forEach((entry) => captured.add(entry.path));
      }
      assert.equal(captured.size, 4096);
      const outside = Array.from({ length: 4120 }, (_, index) => `large/entry-${String(index).padStart(5, "0")}.txt`).find((name) => !captured.has(name));
      assert(outside, "outside-capture path established from actual full capture, not assumed filesystem order");
      stage = "uncaptured-open-path";
      await openPath(outside); await directory("large");
      await until(async () => (await navText()).includes("outside this partial directory capture"), "honest exact outside-capture notice");
      await until(() => run((expected) => document.querySelector(".source-surface header strong")?.textContent === expected, outside), "exact uncaptured path is actually active in editor");
      assert.equal((await request({ type: "file.read", path: outside })).ok, true);
      assert(!observe(await snapshot()).entries.some((entry) => entry.path === outside), "no invented graph node");
      // Re-open retained dirty source, then inspect task details while off-slice.
      stage = "restore-dirty-source";
      await openPath(fixture.sourcePath); await directory("src");
      await until(() => run((expected) => document.querySelector(".cm-content").cmView.rootView.view.state.doc.toString() === expected, dirtySource), "return to exact retained dirty source");
      // Deliberate active-tab changes rebuild the existing editor by design;
      // assert logical restoration before taking its new DOM identity.
      assert.equal(await run(() => { const saved = globalThis.__navigationProof; const state = document.querySelector(".cm-content").cmView.rootView.view.state;
        return state.doc.toString() === saved.source && state.selection.main.anchor === saved.anchor && state.selection.main.head === saved.head && saved.tabs.every((node) => node.isConnected); }), true);
      await run(() => { globalThis.__navigationProof.editor = document.querySelector(".cm-content"); });
      await preserved();
      await click(label("Repository root")); await directory("");
      stage = "task-offslice-reveal";
      await until(() => has("[data-task-status='observed']"), "real Ditz task reference");
      await click(label("Select task navigation-reveal"));
      await until(async () => await contextSubject() === "navigation-reveal", "Q1 actual task attention");
      if (!await run(() => document.querySelector(".task-show-details").getBoundingClientRect().width > 0)) await click(label("Toggle work panel"));
      await focus(".task-show-details"); key("Enter"); await until(() => has(".task-detail .task-title"), "explicit task details");
      assert.equal(await currentDirectory(), "", "task details alone do not navigate");
      await click(label("Reveal working file src/main.ts at line 2")); await directory("src"); await preserved();
      assert.equal(await contextSubject(), "src/main.ts", "Q1 successful foreground task Reveal transfers attention");
      await click(label("Repository root")); await directory("");
      stage = "deleted-refresh";
      const beforeDelete = observe(await snapshot()).observationId;
      await fs.unlink(path.join(fixture.root, "untracked.txt"));
      assert(observe(await snapshot()).entries.some((entry) => entry.path === "untracked.txt"), "retained dated observation before refresh");
      await click(label("Refresh directory")); await until(async () => observe(await snapshot()).observationId !== beforeDelete, "refresh after actual deletion");
      assert(!observe(await snapshot()).entries.some((entry) => entry.path === "untracked.txt"));
      await preserved();
      facts.push("actual Git tracked/untracked/ignored/hidden and nonactionable filesystem boundaries", "ordinary page/filter and captured offpage Reveal reuse observation", "all 4096 captured entries paged without recapture", "exact uncaptured path opens with truthful notice", "real CLI task details stable then explicit off-slice Reveal", "actual deletion requires explicit refresh");
      await screenshot("03-unfamiliar-boundaries.png");
      stage = "file-search-deleted-result";
      await search("untracked-match");
      assert.deepEqual(await searchPaths(), ["search-proof/untracked-match.txt"]);
      await fs.unlink(path.join(fixture.root, "search-proof/untracked-match.txt"));
      const priorRejectedAttention = await contextSubject();
      key("Enter"); await until(async () => !await has(".command-palette"), "deleted result explicitly attempted");
      await until(() => run(() => document.querySelector(".task-reveal-notice")?.textContent.includes("No workspace file") || document.querySelector("#root").textContent.includes("No workspace file")), "deleted result is rejected by actual broker");
      await preserved(); assert.equal(await currentDirectory(), "", "failed search activation does not navigate");
      assert.equal(await contextSubject(), priorRejectedAttention, "Q1 rejected destination preserves deliberate attention");
      stage = "file-search-core-replacement";
      await search("same-match.ts");
      const previousCapture = await request({ type: "repo.search", repositoryId: (await snapshot()).project.id, query: "same-match.ts", refresh: false });
      assert(previousCapture.ok);
      const previousLifecycle = await run(() => window.swarmLifecycle.status());
      const previousCoreRepoCamera = await viewport("repo");
      const metrics = app.getAppMetrics();
      await fs.writeFile(path.join(evidence, "owned-core-metrics.json"), JSON.stringify(metrics));
      const cores = metrics.filter((metric) => metric.type === "Utility" && (metric.name === "swarm-ide-local-core" || metric.serviceName === "swarm-ide-local-core"));
      assert.equal(cores.length, 1, "exact owned packaged core selected, not a user process");
      const corePid = cores[0].pid;
      const procStatus = await fs.readFile(`/proc/${corePid}/status`, "utf8");
      assert.equal(Number(/^PPid:\s+(\d+)$/m.exec(procStatus)?.[1]), process.pid, "owned core is this disposable Electron main child");
      process.kill(corePid, "SIGTERM");
      await until(() => run(async (generation) => { const state = await window.swarmLifecycle.status(); return state.core.generation > generation && state.core.phase === "ready"; }, previousLifecycle.core.generation), "actual owned core replacement");
      await until(() => run(() => document.querySelector(".file-search-status")?.textContent.includes("Git name inventory")), "search recaptured by recovered core");
      assert.equal(await run(() => document.querySelector('[aria-label="Workspace command"]').value), "same-match.ts", "core replacement retains typed query");
      const recoveredCapture = await request({ type: "repo.search", repositoryId: (await snapshot()).project.id, query: "same-match.ts", refresh: false });
      assert(recoveredCapture.ok && recoveredCapture.search.captureId !== previousCapture.search.captureId, "old lifetime capture cannot survive replacement");
      assert.deepEqual(recoveredCapture.search.paths, ["search-proof/a/same-match.ts", "search-proof/b/same-match.ts"]);
      await closeSearch(); await paint(); await preserved();
      assert.equal(await viewport("repo"), previousCoreRepoCamera, "core replacement preserves irrelevant repository camera");
      facts.push("N2 actual owned packaged core termination/recovery retains query and work; capture identity replaced");
      stage = "file-search-git-error";
      await search("same-match.ts");
      const offlineGit = path.join(fixture.root, ".search-offline-git");
      await fs.rename(path.join(fixture.root, ".git"), offlineGit);
      try {
        await click(".file-search-status button");
        await until(() => run(() => document.querySelector(".file-search-status")?.textContent.includes("Refresh failed; retained capture is stale")), "actual Git error retains labelled stale capture");
        assert.deepEqual(await searchPaths(), ["search-proof/a/same-match.ts", "search-proof/b/same-match.ts"]);
        assert(await run(() => document.activeElement === document.querySelector('[aria-label="Workspace command"]')), "Refresh retains keyboard ownership");
      } finally { await fs.rename(offlineGit, path.join(fixture.root, ".git")); }
      await click(".file-search-status button");
      await until(() => run(() => { const text = document.querySelector(".file-search-status")?.textContent ?? ""; return text.includes("Git name inventory") && !text.includes("Refresh failed"); }), "explicit recovery after real Git failure");
      await closeSearch(); await preserved();
      const concurrent = await run(async (repositoryId) => Promise.all([
        window.swarm.request({ protocolVersion: 5, requestId: `search-old:${crypto.randomUUID()}`, type: "repo.search", repositoryId, query: "same-match", refresh: true }),
        window.swarm.request({ protocolVersion: 5, requestId: `search-new:${crypto.randomUUID()}`, type: "repo.search", repositoryId, query: "literal [*]", refresh: false }),
      ]), (await snapshot()).project.id);
      // Renderer concurrency does not force IPC arrival before the first query
      // completes. Held-request unit tests prove cancellation itself; here both
      // legitimate transport orderings must retain exact response identity.
      if (concurrent[0].ok) {
        assert.equal(concurrent[0].search.query, "same-match");
        assert.deepEqual(concurrent[0].search.paths, ["search-proof/a/same-match.ts", "search-proof/b/same-match.ts"]);
      } else {
        assert.equal(concurrent[0].error.code, "REPOSITORY_CANCELLED", "only supersession may reject the older query");
      }
      assert(concurrent[1].ok && concurrent[1].search.query === "literal [*]", "actual newer query owns its response");
      assert.deepEqual(concurrent[1].search.paths, ["search-proof/literal [*] $(not-command).txt"]);
      facts.push("N2 actual Git failure/stale retention and explicit recovery", `N2 actual concurrent typed bridge response identity: older ${concurrent[0].ok ? "completed before newer intent" : "cancelled by newer intent"}`);
      stage = "file-search-partial-capture";
      // Actual filesystem cap, introduced only after the regular journey.
      await fs.mkdir(path.join(fixture.root, "a-capped-search"));
      for (let offset = 0; offset < 8_210; offset += 80) await Promise.all(Array.from({ length: Math.min(80, 8_210 - offset) }, (_, index) =>
        fs.writeFile(path.join(fixture.root, "a-capped-search", `candidate-${String(offset + index).padStart(5, "0")}.txt`), "name cap\n")));
      await search("no-such-filename-n2");
      await click(".file-search-status button");
      await until(() => run(() => document.querySelector(".file-search-status")?.textContent.includes("partial Git name inventory")), "actual bounded partial filename capture");
      assert(await run(() => document.querySelector(".file-search-empty")?.textContent.includes("does not prove the file is absent")));
      await screenshot("04-file-search-partial.png"); await closeSearch(); await preserved();
      facts.push("N2 actual deleted candidate denied on activation without source loss", "N2 actual 8192-name capture cap visibly partial; empty subset is not absence");
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
    await fs.writeFile(path.join(evidence, "failure-focus.json"), JSON.stringify(await win.webContents.executeJavaScript(`(async () => {
      const result = await window.swarm.request({protocolVersion:5,requestId:'failure-focus:'+crypto.randomUUID(),type:'workspace.snapshot'});
      return {focus:result.ok?result.snapshot.focus:null,agentNotice:document.querySelector('.agent-rail')?.textContent,
        draft:document.querySelector('.agent-draft')?.textContent,askDisabled:document.querySelector('.agent-rail .agent-primary')?.disabled,
        clickTrace:globalThis.__navigationClickTrace,
        graphGestureBindings:(window.__on??[]).map(({type,name})=>({type,name}))};
    })()`)));
    await fs.writeFile(path.join(evidence, "failure-window.png"), (await win.webContents.capturePage()).toPNG());
    console.error(await win.webContents.executeJavaScript(`JSON.stringify({active:document.activeElement?.outerHTML,body:document.querySelector('#root')?.textContent?.slice(0,3000)})`));
  }
  await fs.writeFile(path.join(evidence, "navigation-failure.json"), JSON.stringify({ ok: false, stage, message, rendererErrors, rendererErrorStages }));
});
