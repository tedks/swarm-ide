// Native pointer input against the ordinary packaged Component canvas.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path");
module.exports = async function layoutProof({ wc, run, paint, text, camera, shot, click, until, evidence, errors }) {
  const started = Date.now();
  const indexBefore = await fs.readFile(path.join(process.cwd(), ".swarm/plans.json"), "utf8");
  const positions = () => run(() => Object.fromEntries([...document.querySelectorAll(".design-graph .react-flow__node")].map(n => [n.dataset.id, n.style.transform])));
  const edges = () => run(() => [...document.querySelectorAll(".design-graph .react-flow__edge")].map(n => n.dataset.id).sort());
  const drag = async (point, dx, dy, modifiers = []) => {
    const scale = wc.getZoomFactor();
    const xy = (fraction) => ({ x: Math.round((point.x + dx * fraction) * scale), y: Math.round((point.y + dy * fraction) * scale) });
    if (modifiers.includes("control")) wc.sendInputEvent({ type: "keyDown", keyCode: "Control" });
    try {
      wc.sendInputEvent({ type: "mouseMove", modifiers, ...xy(0) });
      wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, modifiers, ...xy(0) });
      for (let step = 1; step <= 8; step++) { wc.sendInputEvent({ type: "mouseMove", button: "left", modifiers, ...xy(step / 8) }); await paint(); }
      wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, modifiers, ...xy(1) }); await paint();
    } finally {
      if (modifiers.includes("control")) wc.sendInputEvent({ type: "keyUp", keyCode: "Control" });
    }
  };
  const nodePoint = (id) => run((id) => {
    const n = document.querySelector(`.design-graph .react-flow__node[data-id="${id}"]`), r = n.getBoundingClientRect();
    const point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    if (!n.contains(document.elementFromPoint(point.x, point.y))) throw new Error(`Node not hit-testable: ${id}`);
    return point;
  }, id);
  await click(".design-graph .react-flow__controls-fitview"); await paint();
  const before = await positions(), cameraBefore = await camera(), edgesBefore = await edges();
  const breadcrumbBefore = await text(".component-graph-card nav");
  const id = "design:cockpit";
  await drag(await nodePoint(id), 48, 12);
  let moved = await positions();
  assert.notEqual(moved[id], before[id], "drag moves the chosen node");
  for (const key of Object.keys(before).filter(key => key !== id)) assert.equal(moved[key], before[key], `other node stays: ${key}`);
  assert.equal(await camera(), cameraBefore, "node drag must not pan or reframe");
  assert.equal(await text(".component-graph-card nav"), breadcrumbBefore, "drag is not selection");
  assert.deepEqual(await edges(), edgesBefore, "authored relationships unchanged");
  // Keep the second move away from the first node's later click target. The
  // prior driver deliberately overlapped those cards and failed its hit test.
  const modifierTarget = "design:runtime", beforeControl = moved;
  await drag(await nodePoint(modifierTarget), -16, -10, ["control"]);
  moved = await positions();
  assert.notEqual(moved[modifierTarget], beforeControl[modifierTarget], "Ctrl-drag moves its target");
  for (const key of Object.keys(before).filter(key => key !== modifierTarget)) assert.equal(moved[key], beforeControl[key], `Ctrl-drag leaves other node: ${key}`);
  assert.equal(await camera(), cameraBefore, "Ctrl-drag also leaves camera alone");
  assert.equal(await text(".component-graph-card nav"), breadcrumbBefore, "Ctrl-drag is not selection");
  await shot("component-node-drag");
  const empty = await run(() => {
    const pane = document.querySelector(".design-graph .react-flow__pane"), r = pane.getBoundingClientRect();
    for (let y = r.top + 12; y < r.bottom - 35; y += 16) for (let x = r.left + 12; x < r.right - 35; x += 16) {
      if (document.elementFromPoint(x, y) === pane && document.elementFromPoint(x + 20, y + 14) === pane) return { x, y };
    }
    throw new Error("No hit-testable empty canvas");
  });
  await drag(empty, 20, 14);
  const panned = await camera();
  assert.notEqual(panned, cameraBefore, "empty canvas drag pans");
  assert.deepEqual(await positions(), moved, "background pan does not move graph-space nodes");
  await click('.component-graph-card button[aria-label="Refresh design"]');
  await until(() => run(() => !document.querySelector('.component-graph-card button[aria-label="Refresh design"]').disabled), "refresh finished");
  assert.deepEqual(await positions(), moved); assert.equal(await camera(), panned);
  // A real click after dragging still navigates; returning restores this view.
  await click(`.design-graph .react-flow__node[data-id="${id}"]`);
  await until(() => text(".component-graph-card nav").then(s => s.includes("Cockpit, focus & source")), "component click selects");
  await click(".component-graph-card header button", "Read design");
  await until(() => text(".design-prose").then(s => s.includes("EditorPane")), "selected component document");
  await shot("component-document");
  await click(".component-graph-card nav button", "Swarm IDE · system design"); await paint();
  assert.deepEqual(await positions(), moved, "A to B to A retains arrangement");
  const beforeResetCamera = await camera();
  await click(".design-graph .projection-layout-reset");
  assert.deepEqual(await positions(), before, "reset restores this view's defaults");
  assert.equal(await camera(), beforeResetCamera, "reset does not change the camera");
  assert.equal(await fs.readFile(path.join(process.cwd(), ".swarm/plans.json"), "utf8"), indexBefore, "dragging never edits plan truth");
  assert.deepEqual(errors, []);
  await shot("component-layout-reset");
  await fs.writeFile(path.join(evidence, "proof.json"), JSON.stringify({ ok: true, layoutOnly: true, elapsedMs: Date.now() - started, actualRepo: process.cwd(), packaged: true, before, moved, cameraBefore, panned, nativeNodeDrag: true, nativeControlDrag: true, nativeBackgroundPan: true, noDragSelection: true, refreshRetention: true, componentRoundtrip: true, documentOpened: true, reset: true, planUnchanged: true, rendererErrors: errors }));
};
