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
  const rendererErrors = [];
  wc.on("console-message", (event) => { if (event.level === "error") { rendererErrors.push(event.message.slice(0, 4096)); console.error(`Owned fixture renderer: ${event.message}`); } });
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => addEventListener("error", (event) => console.error(event.error?.stack ?? event.message)));
  await run(() => { const report = console.error; console.error = (...args) => report(...args.map((value) => value instanceof Error ? value.stack : value)); });
  const has = (selector) => run((s) => Boolean(document.querySelector(s)), selector);
  const click = (selector) => run((s) => {
    const target = document.querySelector(s);
    if (!target || target.disabled) throw new Error(`Missing/disabled control ${s}`);
    target.scrollIntoView({ block: "nearest" }); target.click();
  }, selector);
  const text = (selector) => run((s) => document.querySelector(s)?.textContent ?? "", selector);
  const button = (label) => `[aria-label=${JSON.stringify(label)}]`;
  const key = (keyCode, modifiers = []) => {
    if (keyCode === "Return") keyCode = "Enter";
    wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    if (keyCode === "Enter") wc.sendInputEvent({ type: "char", keyCode: "\r", modifiers });
    wc.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  };
  const focus = (selector) => run((s) => {
    const target = document.querySelector(s); if (!target) throw new Error(`No focus target ${s}`);
    target.scrollIntoView({ block: "nearest" }); target.focus();
  }, selector);
  win.focus(); wc.focus();
  await until(() => win.isFocused() && wc.isFocused(), "native window and webContents focus");
  const fill = async (selector, value) => {
    await focus(selector); key("A", ["control"]);
    await until(() => run((s) => { const input = document.querySelector(s); return input.selectionStart === 0 && input.selectionEnd === input.value.length; }, selector), "native select-all input");
    await wc.insertText(value);
    await until(() => run((s, expected) => document.querySelector(s).value === expected, selector, value), "exact user input");
  };
  const request = (input) => run((body) => window.swarm.request({ protocolVersion: 7, requestId: `task-proof:${crypto.randomUUID()}`, ...body }), input);
  const status = () => run(() => document.querySelector("[data-task-status]")?.getAttribute("data-task-status"));
  const snapshotRevision = () => run(() => document.querySelector(".task-panel .task-revision code")?.textContent);
  const refresh = async (expected) => {
    await until(() => run(() => !document.querySelector(".task-heading button")?.disabled), "refresh enabled");
    await click(".task-panel .task-heading button");
    await until(async () => await status() === expected && await run(() => !document.querySelector(".task-panel .task-heading button").disabled), `task status ${expected}`);
  };
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const screenshot = async (name) => { await paint(); await fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG()); };
  const showDetails = async () => {
    if (!await run(() => document.querySelector(".task-show-details").getBoundingClientRect().width > 0)) {
      await click(button("Toggle work panel"));
      await until(() => run(() => document.querySelector(".task-show-details").getBoundingClientRect().width > 0), "explicit work panel");
    }
    await focus(".task-show-details"); key("Return");
    await until(() => run(() => document.activeElement?.textContent === "Return to source information" &&
      document.querySelector(".workbench").dataset.compactPanel === "info" && document.querySelector(".task-detail").getBoundingClientRect().width > 0), "visible detail and focus after keyboard Show");
    await until(() => has(".task-detail .task-title"), "task detail after keyboard Show");
    assert.equal(await run(() => document.activeElement?.textContent), "Return to source information");
  };
  const preserved = async () => {
    const proof = await run(() => {
      const saved = globalThis.__taskProof;
      const state = document.querySelector(".cm-content").cmView.rootView.view.state;
      const transforms = [...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform);
      return { checks: {
        editor: saved.editor === document.querySelector(".cm-content"), draft: saved.draft === document.querySelector(".agent-draft textarea"),
        graphs: saved.graphs.length === document.querySelectorAll(".react-flow").length && saved.graphs.every((node, index) => node === document.querySelectorAll(".react-flow")[index]),
        cameras: JSON.stringify(saved.transforms) === JSON.stringify(transforms),
        source: saved.source === state.doc.toString(), anchor: saved.anchor === state.selection.main.anchor, head: saved.head === state.selection.main.head,
        draftValue: saved.draftValue === document.querySelector(".agent-draft textarea").value,
      }, before: { transforms: saved.transforms, anchor: saved.anchor, head: saved.head }, after: { transforms, anchor: state.selection.main.anchor, head: state.selection.main.head } };
    });
    assert(Object.values(proof.checks).every(Boolean), `source/draft/graph DOM and cameras retained: ${JSON.stringify(proof)}`);
  };
  // D5 additions intentionally do not change preserved() or its original saved
  // baseline. Inspect the intermediate Replace state before ordinary restoration.
  const attachmentRetained = async (expectedInstructions) => {
    const proof = await run((expected, sourcePath) => {
      const saved = globalThis.__taskProof;
      const state = document.querySelector(".cm-content").cmView.rootView.view.state;
      return {
        editor: saved.editor === document.querySelector(".cm-content"),
        draft: saved.draft === document.querySelector(".agent-draft textarea"),
        graphs: saved.graphs.length === document.querySelectorAll(".react-flow").length && saved.graphs.every((node, index) => node === document.querySelectorAll(".react-flow")[index]),
        cameras: JSON.stringify(saved.transforms) === JSON.stringify([...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform)),
        source: saved.source === state.doc.toString(), anchor: saved.anchor === state.selection.main.anchor, head: saved.head === state.selection.main.head,
        instructions: document.querySelector(".agent-draft textarea").value === expected,
        fixedSource: document.querySelector(".agent-draft > .agent-context-path").textContent === sourcePath,
      };
    }, expectedInstructions, fixture.sourcePath);
    assert(Object.values(proof).every(Boolean), `attachment intermediate source/draft/camera retention: ${JSON.stringify(proof)}`);
  };
  const nativeAttachmentClick = async (selector, allowDisabled = false) => {
    await run((s) => {
      const target = document.querySelector(s); if (!target) throw new Error(`No attachment control ${s}`);
      target.scrollIntoView({ block: "center" });
    }, selector);
    await paint();
    const point = await run((s, disabledAllowed) => {
      const target = document.querySelector(s);
      if (!target || (!disabledAllowed && target.disabled)) throw new Error(`Missing/disabled attachment control ${s}`);
      const rect = target.getBoundingClientRect();
      const x = Math.round(rect.x + rect.width / 2), y = Math.round(rect.y + rect.height / 2);
      if (!rect.width || !rect.height || !target.contains(document.elementFromPoint(x, y))) throw new Error(`Attachment control not visibly reachable ${s}`);
      return { x, y };
    }, selector, allowDisabled);
    // DOM hit testing uses CSS pixels; native widget input uses DIP coordinates.
    const nativePoint = { x: Math.round(point.x * wc.getZoomFactor()), y: Math.round(point.y * wc.getZoomFactor()) };
    wc.sendInputEvent({ type: "mouseMove", ...nativePoint });
    wc.sendInputEvent({ type: "mouseDown", ...nativePoint, button: "left", clickCount: 1 });
    wc.sendInputEvent({ type: "mouseUp", ...nativePoint, button: "left", clickCount: 1 });
    await paint();
  };
  const attachmentPreparation = () => run(() => ({
    prepared: document.querySelector(".agent-draft .agent-launch-context")?.textContent ?? null,
    confirmed: document.querySelector(".agent-draft .agent-confirm input")?.checked ?? null,
    prepareLabel: document.querySelector(".agent-draft .agent-primary")?.textContent ?? null,
    prepareDisabled: document.querySelector(".agent-draft .agent-primary")?.disabled ?? null,
  }));
  const attachmentPreview = async (selector, expectedReference) => {
    const preview = await run((s) => {
      const root = document.querySelector(s); if (!root) throw new Error(`Missing attachment preview ${s}`);
      return {
        referenceText: root.querySelector(".agent-task-reference").textContent,
        title: root.querySelector(".agent-task-preview-title").textContent,
        description: root.querySelector(".agent-task-preview-description").textContent,
        editable: root.querySelectorAll("textarea,input,[contenteditable=true]").length,
        executable: root.querySelectorAll("script,img,iframe").length,
        label: root.textContent,
      };
    }, selector);
    assert.equal(preview.referenceText,
      `${expectedReference.taskId} · ${expectedReference.provider}Repository: ${expectedReference.repositoryId} · World: ${expectedReference.worldId}` +
      `Metadata: ${expectedReference.metadataCommit.algorithm}:${expectedReference.metadataCommit.hex}Issue blob: ${expectedReference.issueBlob.algorithm}:${expectedReference.issueBlob.hex}`,
      "visible complete labelled task pin, including both object algorithms");
    assert.equal(preview.title, fixture.title, "decoded literal readonly task title");
    assert.equal(preview.description, fixture.description, "decoded literal readonly task description");
    assert.equal(preview.editable, 0, "task preview is not an editable instruction field");
    assert.equal(preview.executable, 0, "hostile task preview is text, never executable markup");
    assert.match(preview.label, /[Pp]repare/, "preview identifies its later core verification boundary");
    return { ...preview, reference: expectedReference };
  };
  const screenshotAttachment = async (selector, name) => {
    await run((s) => {
      const target = document.querySelector(s), dock = target?.closest(".agent-dock-panel");
      if (!target || !dock) throw new Error(`Missing dock attachment capture ${s}`);
      // Scroll only the existing dock; do not resize it or the graphs to stage
      // evidence. A populated DOM below the fold is not visible UI evidence.
      dock.scrollTop += target.getBoundingClientRect().top - dock.getBoundingClientRect().top;
    }, selector);
    await paint();
    assert.equal(await run((s) => {
      const target = document.querySelector(s), heading = target.querySelector("h3");
      const r = heading.getBoundingClientRect(), d = target.closest(".agent-dock-panel").getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top >= d.top && r.bottom <= d.bottom &&
        heading.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }, selector), true, `attachment heading is actually visible before ${name}`);
    await screenshot(name);
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
    let previous, stableAt = Date.now();
    await until(async () => { const value = await run((s) => document.querySelector(s).parentElement.querySelector(".react-flow__viewport").style.transform, selector); if (value !== previous) { previous = value; stableAt = Date.now(); } return Date.now() - stableAt >= 300; }, "initial camera settled");
    const before = await run((s) => document.querySelector(s).parentElement.querySelector(".react-flow__viewport").style.transform, selector);
    const rect = await run((s) => {
      const pane = document.querySelector(s), r = pane.getBoundingClientRect();
      for (const fy of [.02, .98, .05, .95, .2, .8, .5]) for (const fx of [.02, .98, .05, .95, .2, .8, .5]) {
        const x = Math.round(r.x + r.width * fx), y = Math.round(r.y + r.height * fy);
        if (document.elementFromPoint(x, y) === pane) return { x, y };
      }
      throw new Error("No visible blank graph pane point");
    }, selector);
    const x = Math.round(rect.x), y = Math.round(rect.y);
    wc.sendInputEvent({ type: "mouseMove", x, y });
    wc.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
    wc.sendInputEvent({ type: "mouseMove", x: x + 31, y: y + 19, movementX: 31, movementY: 19 });
    wc.sendInputEvent({ type: "mouseUp", x: x + 31, y: y + 19, button: "left", clickCount: 1 });
    await until(async () => (await run((s) => document.querySelector(s).parentElement.querySelector(".react-flow__viewport").style.transform, selector)) !== before, `deliberately move ${topology} camera`);
  }
  await focus(".cm-content"); key("End", ["control"]);
  await until(() => run(() => { const s = document.querySelector(".cm-content").cmView.rootView.view.state; return s.selection.main.anchor === s.doc.length; }), "native end of source");
  await wc.insertText("// unsaved T3 intent"); key("Home", ["control"]); key("Right");
  await until(() => run(() => document.querySelector(".cm-content").cmView.rootView.view.state.selection.main.anchor === 1), "exact dirty editor cursor");
  assert.equal(await run(() => document.querySelector(".cm-content").cmView.rootView.view.state.doc.toString()), fixture.sourceText + "// unsaved T3 intent");
  // Use native pointer activation after graph panning and source editing so
  // browser drag/focus bookkeeping receives a complete next gesture.
  const draftPoint = await run(() => {
    const target = document.querySelector(".agent-rail .agent-primary");
    target.scrollIntoView({ block: "center" });
    const rect = target.getBoundingClientRect();
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  });
  await paint();
  wc.sendInputEvent({ type: "mouseMove", ...draftPoint });
  wc.sendInputEvent({ type: "mouseDown", ...draftPoint, button: "left", clickCount: 1 });
  wc.sendInputEvent({ type: "mouseUp", ...draftPoint, button: "left", clickCount: 1 });
  await until(() => has(".agent-draft textarea"), "fixed-focus draft");
  await fill(".agent-draft textarea", "Retain this independent user draft; task text is not instructions.");
  await fill(".task-search input", fixture.taskId);
  await run(() => {
    const state = document.querySelector(".cm-content").cmView.rootView.view.state;
    globalThis.__taskProof = { editor: document.querySelector(".cm-content"), draft: document.querySelector(".agent-draft textarea"),
      graphs: [...document.querySelectorAll(".react-flow")], transforms: [...document.querySelectorAll(".react-flow__viewport")].map((n) => n.style.transform),
      source: state.doc.toString(), anchor: state.selection.main.anchor, head: state.selection.main.head,
      draftValue: document.querySelector(".agent-draft textarea").value };
  });
  await click(button(`Select task ${fixture.taskId}`)); await showDetails(); await preserved();
  await click(reveal);
  await until(async () => (await text(".tasks-reveal-notice")).includes("unsaved"), "dirty cursor protection notice");
  assert.deepEqual(await run(() => { const { anchor, head } = document.querySelector(".cm-content").cmView.rootView.view.state.selection.main; return { anchor, head }; }), { anchor: 1, head: 1 }, "dirty Reveal preserves logical cursor");
  await preserved();
  await showDetails();
  await click(button(`Reveal working file ${fixture.missingPath} at line 2`));
  await until(async () => (await text(".tasks-reveal-notice")).includes("FILE_NOT_FOUND"), "missing file typed failure");
  await preserved();
  await showDetails(); await screenshot("01-real-tasks-100.png");

  const layouts = [];
  const attachments = [];
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
      taskWidth: document.querySelector(".task-detail").getBoundingClientRect().width,
      transforms: globalThis.__taskProof.transforms,
      cursor: { anchor: globalThis.__taskProof.anchor, head: globalThis.__taskProof.head },
      textLength: globalThis.__taskProof.source.length,
      focus: document.activeElement.textContent,
    }));
    assert(measure.documentOverflow <= 1 && measure.taskOverflow <= 1 && measure.editorWidth > 100 && measure.taskWidth > 100);
    layouts.push({ percent, ...measure }); await screenshot(`02-real-tasks-${percent}-compact.png`);
    // Real CLI-authored Ditz detail through the ordinary packaged UI. D3 still
    // rejects attached Prepare; this is UI proof, not D4 success or a model run.
    const expectedReference = { version: 1, worldId: first.task.observation.snapshot.worldId,
      repositoryId: first.task.observation.snapshot.repositoryId, provider: first.task.observation.snapshot.provider,
      metadataCommit: fixture.firstCommit, taskId: fixture.taskId, issueBlob: detail.task.result.detail.blob };
    const attach = ".task-detail:not(.task-document) .task-attach button";
    const proposal = '.agent-task-proposal[aria-label="Review task attachment"]';
    const originalInstructions = await run(() => globalThis.__taskProof.draftValue);
    const beforeAttachmentAgent = await request({ type: "agent.snapshot" });
    assert(beforeAttachmentAgent.ok && beforeAttachmentAgent.agent.kind === "snapshot");
    assert.equal(beforeAttachmentAgent.agent.snapshot.runs.length, 0);
    assert.equal(beforeAttachmentAgent.agent.snapshot.capabilities.controls.launch, false);
    assert.equal(await has(".agent-task-slot"), false);
    const beforeCancel = await attachmentPreparation();
    await nativeAttachmentClick(attach);
    await until(() => has(proposal), "native Attach reveals explicit review");
    await attachmentPreview(proposal, expectedReference);
    await attachmentRetained(originalInstructions);
    await screenshotAttachment(proposal, `04-task-attachment-${percent}-review.png`);
    await attachmentRetained(originalInstructions);
    await focus(`${proposal} [data-task-attachment='cancel']`); key("Escape");
    await until(async () => !await has(proposal), "keyboard Escape cancels task attachment");
    assert.equal(await has(".agent-task-slot"), false);
    assert.deepEqual(await attachmentPreparation(), beforeCancel, "Cancel cannot invalidate preparation");
    assert.equal(await run((s) => document.activeElement === document.querySelector(s), attach), true, "Cancel returns only to its still-mounted invoker");
    await preserved();
    await nativeAttachmentClick(attach);
    await until(() => has(proposal), "review again for Append");
    assert.equal(await text(`${proposal} [data-task-attachment='append']`), "Append — keep instructions");
    await nativeAttachmentClick(`${proposal} [data-task-attachment='append']`);
    await until(async () => !await has(proposal) && await has(".agent-task-slot"), "Append fills one task slot");
    await attachmentRetained(originalInstructions); await preserved();
    const preview = await attachmentPreview(".agent-task-slot", expectedReference);
    await screenshotAttachment(".agent-task-slot", `04-task-attachment-${percent}-append.png`);
    await attachmentRetained(originalInstructions);
    const beforeDuplicate = await attachmentPreparation();
    const duplicateSlot = await text(".agent-task-slot");
    const duplicateNotice = await text(".agent-draft-notice");
    assert.equal(await run((s) => document.querySelector(s).disabled, attach), true);
    assert.equal(await text(attach), "Already attached");
    await nativeAttachmentClick(attach, true);
    assert.equal(await has(proposal), false, "same full pin does not open another proposal");
    assert.equal(await text(".agent-task-slot"), duplicateSlot, "duplicate retains the exact slot");
    assert.equal(await text(".agent-draft-notice"), duplicateNotice, "disabled duplicate cannot change the notice");
    assert.deepEqual(await attachmentPreparation(), beforeDuplicate, "duplicate cannot invalidate preparation");
    await preserved();
    await nativeAttachmentClick(".agent-draft .agent-primary");
    await until(async () => (await text(".agent-draft-notice")).includes("UNSUPPORTED_CONTROL") &&
      await run(() => !document.querySelector(".agent-draft .agent-primary").disabled), "actual attached Prepare reports D3 UNSUPPORTED_CONTROL");
    const unavailableNotice = await text(".agent-draft-notice");
    assert.equal(await has(".agent-draft .agent-launch-context"), false, "unavailable resolver must not invent a prepared context");
    await attachmentPreview(".agent-task-slot", expectedReference); await preserved();
    await screenshot(`05-task-attachment-${percent}-unavailable.png`);
    await nativeAttachmentClick(".agent-task-slot [data-task-attachment='remove']");
    await until(async () => !await has(".agent-task-slot"), "Remove deletes only the task slot");
    await attachmentRetained(originalInstructions); await preserved();
    await nativeAttachmentClick(attach);
    await until(() => has(proposal), "review again for Replace");
    assert.equal(await text(`${proposal} [data-task-attachment='replace']`), "Replace — clear instructions");
    await nativeAttachmentClick(`${proposal} [data-task-attachment='replace']`);
    await until(async () => !await has(proposal) && await has(".agent-task-slot"), "Replace fills slot");
    await attachmentRetained(""); // Must be checked BEFORE ordinary restoration.
    await attachmentPreview(".agent-task-slot", expectedReference);
    await screenshotAttachment(".agent-task-slot", `06-task-attachment-${percent}-replace-empty.png`);
    await attachmentRetained("");
    await fill(".agent-draft textarea", originalInstructions);
    await preserved();
    await nativeAttachmentClick(".agent-task-slot [data-task-attachment='remove']");
    await until(async () => !await has(".agent-task-slot"), "return to original free-instruction-only draft");
    await preserved();
    const afterAttachmentAgent = await request({ type: "agent.snapshot" });
    assert(afterAttachmentAgent.ok && afterAttachmentAgent.agent.kind === "snapshot");
    assert.equal(afterAttachmentAgent.agent.snapshot.runs.length, 0);
    assert.equal(afterAttachmentAgent.agent.snapshot.capabilities.controls.launch, false);
    attachments.push({ percent, realCliAuthoredMetadata: true, ordinaryPackagedUi: true,
      boundary: "D5 UI on D3 resolver-unavailable base; not successful attached preparation or provider delivery",
      reference: preview.reference, readonlyTitle: preview.title, readonlyDescription: preview.description,
      cancel: "native Escape; instructions/preparation unchanged; invoker restored",
      append: "exact original instructions retained", duplicate: "same full pin; no proposal or preparation invalidation",
      remove: "slot only; instructions retained", replace: "empty instructions verified before ordinary restoration",
      sourceCursorDraftAndCamerasRetainedThroughReplace: true, prepareError: "UNSUPPORTED_CONTROL", unavailableNotice,
      beforeRuns: beforeAttachmentAgent.agent.snapshot.runs.length, afterRuns: afterAttachmentAgent.agent.snapshot.runs.length,
      beforeLaunchAvailable: beforeAttachmentAgent.agent.snapshot.capabilities.controls.launch,
      afterLaunchAvailable: afterAttachmentAgent.agent.snapshot.capabilities.controls.launch,
    });
    await focus(".task-detail:not(.task-document) .task-heading button");
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
  assert.deepEqual(rendererErrors, [], "renderer exceptions are failures, even if a later browser fallback restores final state");
  await fs.writeFile(path.join(evidence, "task-proof.json"), JSON.stringify({ ok: true, realDitz: true, packagedCore: true,
    modelTurns: 0, ditzVersion: fixture.ditzVersion, firstRevision: fixture.firstCommit, advancedRevision: advanced,
    invalidGitStructureRevision: invalid, issueBlob: detail.task.result.detail.blob, layouts, attachments, rendererErrors, elapsedMs: Date.now() - started,
    facts: ["file URL production assets", "archive-local YAML plus missing-parser negative", "real preload/main/core tasks",
      "literal hostile text", "explicit line Reveal", "dirty cursor/text/draft/graphs retained", "missing file typed error",
      "cheap stale and explicit adoption", "expired pinned detail", "retained malformed/unavailable and recovery", "source disk unchanged",
      "D5 native attachment review/Cancel/Append/Remove/Replace/full-pin duplicate at100/150",
      "real UI attached Prepare reports D3 UNSUPPORTED_CONTROL; no successful core attachment/provider claim"] }, null, 2));
}
main().catch(async (error) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack}` : "Task acceptance failed";
  console.error(message);
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    await fs.writeFile(path.join(evidence, "failure-window.png"), (await win.webContents.capturePage()).toPNG());
    console.error(await win.webContents.executeJavaScript(`JSON.stringify({active:document.activeElement?.outerHTML,rail:document.querySelector('.agent-rail')?.textContent,draft:document.querySelector('.agent-draft')?.textContent,body:document.querySelector('#root')?.textContent?.slice(0,500)})`));
  }
  await fs.writeFile(path.join(evidence, "task-failure.json"), JSON.stringify({ ok: false, message }));
});
