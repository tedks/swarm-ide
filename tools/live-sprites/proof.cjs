// Owned virtual driver around the unchanged packaged production composition.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const evidence = process.env.SWARM_ARTIFACT_DIR;
const sessions = { primary: process.env.SWARM_SPRITE_PRIMARY_SESSION, feature: process.env.SWARM_SPRITE_FEATURE_SESSION,
  pathless: process.env.SWARM_SPRITE_PATHLESS_SESSION, unrelated: process.env.SWARM_SPRITE_UNRELATED_SESSION };
const errors = [];
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
  // A DOM match alone could be in an inactive graph lens. Open the map when
  // present and require an actually visible, unobscured sprite for the click.
  await until(() => run(() => !!document.querySelector(".workbench")), "workspace");
  await run(() => [...document.querySelectorAll(".repository-view-switch button")].find((button) => button.textContent === "Map")?.click());
  const surface = (selector, id) => run((selector, id) => [...document.querySelectorAll(`${selector} .graph-agent-sprite[data-agent-id='${id}']`)]
    .filter((element) => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0; })
    .map((element) => ({ path: element.dataset.agentPath, title: element.title, node: element.closest(".react-flow__node")?.dataset.id })), selector, id);
  await until(async () => (await surface(".graph-pane[data-topology='repo']", sessions.feature)).length > 0, "feature agent on primary repository map");
  await run(() => document.querySelector("#reconcile-success")?.click());
  await until(async () => (await surface(".graph-pane[data-topology='service']", sessions.feature)).length > 0, "feature agent on service graph");
  await until(async () => (await surface(".component-graph-card", sessions.feature)).length > 0, "feature agent on component graph");
  const primaryCoverage = {};
  for (const [name, selector] of Object.entries({ repository: ".graph-pane[data-topology='repo']", service: ".graph-pane[data-topology='service']", component: ".component-graph-card" })) {
    primaryCoverage[name] = { primary: await surface(selector, sessions.primary), feature: await surface(selector, sessions.feature) };
    assert(primaryCoverage[name].primary.length > 0 && primaryCoverage[name].feature.length > 0, `${name} must show both same-project worktrees`);
  }
  const unrelatedVisible = await run((id) => !!document.querySelector(`.graph-agent-sprite[data-agent-id='${id}'], .graph-agent-placement-summary button[data-agent-id='${id}']`), sessions.unrelated);
  assert.equal(unrelatedVisible, false, "unrelated project agent must not enter graph layers");
  assert(await run((id) => !!document.querySelector(`.graph-agent-placement-summary button[data-agent-id='${id}']`), sessions.pathless), "pathless same-project agent must remain reachable as unplaced");
  assert(Object.values(primaryCoverage).every((coverage) => coverage.feature.every((entry) => entry.title.includes("feature/agent"))));
  await run((id) => { const select = document.querySelector("select[aria-label='Worktree']"); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(select, id); select.dispatchEvent(new Event("change", { bubbles: true })); }, sessions.feature);
  await until(() => run((ids) => !!document.querySelector(`.graph-pane[data-topology='repo'] .graph-agent-sprite[data-agent-id='${ids.feature}']`) &&
    !document.querySelector(`.graph-agent-sprite[data-agent-id='${ids.primary}'], .graph-agent-placement-summary button[data-agent-id='${ids.primary}']`), sessions), "feature worktree graph and exact agent scope");
  assert.equal(await run((id) => !!document.querySelector(`.graph-agent-sprite[data-agent-id='${id}'], .graph-agent-placement-summary button[data-agent-id='${id}']`), sessions.primary), false,
    "feature scope must exclude the primary worktree agent");
  assert.equal(await run((id) => !!document.querySelector(`.graph-agent-sprite[data-agent-id='${id}'], .graph-agent-placement-summary button[data-agent-id='${id}']`), sessions.unrelated), false,
    "feature scope must exclude unrelated agents");
  assert(await run((id) => !!document.querySelector(`.graph-agent-placement-summary button[data-agent-id='${id}']`), sessions.pathless), "feature pathless agent must remain unplaced");
  const actual = await surface(".graph-pane[data-topology='repo']", sessions.feature);
  assert(actual.length > 0 && actual.every((entry) => entry.path === "src/shared.ts" && entry.node));
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
  const hit = await run((id) => {
    for (const element of document.querySelectorAll(`.graph-agent-sprite[data-agent-id='${id}']`)) {
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
      const box = element.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2;
      if (box.width > 0 && box.height > 0 && element.contains(document.elementFromPoint(x, y))) {
        // Selection may already name this single registered session. Record
        // the actual native click rather than treating identity alone as proof.
        window.__spritePointerWitness = null;
        element.addEventListener("click", (event) => {
          window.__spritePointerWitness = { trusted: event.isTrusted, sessionId: element.dataset.agentId };
        }, { capture: true, once: true });
        return { x, y };
      }
    }
    return null;
  }, sessions.feature);
  assert(hit, "A real agent sprite must be visible and unobscured");
  contents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, x: Math.round(hit.x), y: Math.round(hit.y) });
  contents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, x: Math.round(hit.x), y: Math.round(hit.y) });
  await until(() => run((id) => window.__spritePointerWitness?.trusted === true && window.__spritePointerWitness.sessionId === id, sessions.feature), "trusted pointer click reached exact sprite");
  await until(() => run((id) => document.querySelector(".agent-conversation")?.dataset.externalSession === id, sessions.feature), "exact conversation selection");
  const after = await run(() => ({ text: document.querySelector(".cm-content").textContent, cameras: [...document.querySelectorAll(".react-flow__viewport")].map((node) => node.style.transform) }));
  assert.equal(after.text, before.text); assert.deepEqual(after.cameras, before.cameras); assert.deepEqual(errors, []);
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ registeredObservation: true, owned: true, twoWorktrees: true,
    unrelatedExcluded: true, featureExactScope: true, pathlessUnplaced: true, sessions, primaryCoverage, actual,
    visibleNativeClick: true, sourceRetained: true, camerasRetained: true, modelTurns: 0, errors }));
  await until(() => fs.access(path.join(evidence, "close-request")).then(() => true, () => false), "capture");
  // The repository and profile are disposable proof resources. Exit this owned
  // process without saving the deliberate dirty buffer; production close guards
  // and the operator's IDE are never involved.
  app.exit(0);
}
main().catch(async (error) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) await fs.writeFile(path.join(evidence, "failure.png"), (await win.capturePage()).toPNG());
  await fs.writeFile(path.join(evidence, "failure.json"), JSON.stringify({ message: error.stack, errors })); app.exit(1);
});
