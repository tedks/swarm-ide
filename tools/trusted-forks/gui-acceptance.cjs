// TEST ONLY. Actual packaged main/preload/core/service; no IPC interception.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const evidence = process.env.SWARM_TRUSTED_EVIDENCE;
const rendererErrors = [];
let stage = 'startup';
app.on('web-contents-created', (_event, wc) => {
  wc.on('console-message', event => { if (event.level === 'error') rendererErrors.push(event.message.slice(0, 4096)); });
  wc.on('render-process-gone', (_event, details) => rendererErrors.push(`Renderer gone: ${details.reason}`));
});
require(path.join(process.env.SWARM_TRUSTED_PACKAGE, 'app/electron/main.js'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await delay(40); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now(), fixture = JSON.parse(await fs.readFile(path.join(evidence, 'fixture.json'), 'utf8'));
  await app.whenReady(); assert.equal(app.getPath('userData'), process.env.SWARM_TRUSTED_PROFILE);
  await until(() => fs.access(path.join(evidence, 'window-selected')).then(() => true, () => false), 'owned window selection', 30000);
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  assert(wc.getURL().startsWith('file:'));
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => {
    addEventListener('error', event => console.error(event.error?.stack ?? event.message));
    addEventListener('unhandledrejection', event => console.error(event.reason?.stack ?? event.reason));
  });
  const click = async (selector, label = null) => {
    const point = await run((s, t) => {
      const element = [...document.querySelectorAll(s)].find(node => t === null || node.textContent.trim() === t);
      if (!element || element.disabled) throw new Error(`Missing or disabled ${s}: ${t}`);
      element.scrollIntoView({ block: 'nearest' });
      const r = element.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (!r.width || !r.height || !element.contains(document.elementFromPoint(x, y))) throw new Error(`Occluded ${s}: ${t}`);
      return { x: Math.round(x), y: Math.round(y) };
    }, selector, label);
    wc.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 }); await delay(80);
  };
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await delay(50);
  };
  const text = selector => run(s => document.querySelector(s)?.textContent ?? '', selector);
  const status = () => text('.trusted-local header small');
  const shot = async name => fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG());
  const providerWire = async () => (await fs.readFile(path.join(evidence, 'provider-wire.jsonl'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(JSON.parse);
  const select = async token => {
    await click('.trusted-fleet-list button[data-run-token="' + token + '"]');
    await until(() => run(t => document.querySelector('.trusted-selected-run')?.dataset.runToken === t, token), 'exact selected run');
  };
  // Read-only observations cross the real preload/main/core schema boundary.
  const snapshot = token => run(async selected => {
    const response = await window.swarm.request({ protocolVersion: 7, requestId: 'fork-gui:' + crypto.randomUUID(), type: 'trusted.snapshot', token: selected });
    if (!response.ok || !response.trusted) throw new Error('Actual trusted snapshot unavailable');
    return response.trusted.snapshot;
  }, token);

  stage = 'source-and-retained-logical-state';
  await until(() => run(() => Boolean(document.querySelector('[aria-label="Open file proof.ts"]'))), 'real disposable file listing');
  await click('[aria-label="Open file proof.ts"]');
  await until(() => run(() => Boolean(document.querySelector('.cm-content'))), 'source open');
  await click('.cm-content'); await key('End', ['control']); await wc.insertText('// unsaved fork proof buffer');
  await until(() => text('.cm-content').then(value => value.includes('unsaved fork proof buffer')), 'dirty buffer');
  await run(() => { window.__forkRetained = { source: document.querySelector('.cm-content'), graphs: [...document.querySelectorAll('.react-flow')] }; });
  const retained = () => run(() => {
    const view = document.querySelector('.cm-content')?.cmView?.view;
    if (!view) throw new Error('CodeMirror logical state unavailable');
    return { source: view.state.doc.toString(), selection: view.state.selection.toJSON(),
      cameras: [...document.querySelectorAll('.react-flow__viewport')].map(e => e.style.transform), graphCount: document.querySelectorAll('.react-flow').length };
  });
  const before = await retained(); assert(before.graphCount > 0); assert(before.cameras.length > 0);
  await fs.writeFile(path.join(evidence, 'before.json'), JSON.stringify(before, null, 2));
  stage = 'fixed-draft';
  await click('.agent-dock-welcome .agent-primary');
  await until(() => run(() => Boolean(document.querySelector('.agent-draft textarea'))), 'agent instruction draft');
  const spec = 'Fork GUI proof: preserve this independent agent draft.';
  await click('.agent-draft textarea'); await key('A', ['control']); await wc.insertText(spec);
  await click('.agent-draft input[placeholder="Provider default (unresolved)"]'); await key('A', ['control']); await key('Backspace');
  await run(() => { window.__forkRetained.draft = document.querySelector('.agent-draft textarea'); });
  assert.equal(await run(() => document.querySelector('.agent-draft textarea').value), spec);

  stage = 'prepare-parent';
  assert.equal((await providerWire()).filter(row => row.event === 'start').length, 0);
  await click('.trusted-local button', 'Prepare trusted-local context');
  await until(() => run(() => Boolean(document.querySelector('.trusted-review'))), 'parent exact prepared context');
  const prompt = await text('.trusted-review pre');
  assert(prompt.includes('proof.ts') && prompt.includes(spec) && !prompt.includes('unsaved fork proof buffer'));
  assert(await run(() => [...document.querySelectorAll('.trusted-review button')].find(e => e.textContent === 'Launch trusted-local Codex').disabled));
  assert.equal((await providerWire()).filter(row => row.event === 'start').length, 0, 'Prepare cannot start a provider');
  await click('.trusted-review input[type="checkbox"]');
  stage = 'launch-parent';
  await click('.trusted-review button', 'Launch trusted-local Codex');
  await until(() => text('.trusted-output').then(value => value.includes('Deterministic fork parent ready')), 'parent actual provider output');
  await until(() => status().then(value => value === 'ready'), 'completed parent');
  const parentToken = await run(() => document.querySelector('.trusted-selected-run').dataset.runToken);
  const parent = await snapshot(parentToken);
  assert.deepEqual(parent.forkPoint, { threadId: 'fork-gui-thread-parent', turnId: 'fork-gui-turn-parent' });
  await until(() => run(() => Boolean(document.querySelector('[aria-label="Fork trusted conversation"] form textarea'))), 'ordinary fork form');
  assert((await text('[aria-label="Fork trusted conversation"]')).includes('not an isolated worktree'));
  assert(await run(() => document.querySelector('[aria-label="Fork trusted conversation"] form button').disabled));

  stage = 'ordinary-ui-native-fork';
  const childText = 'Fork GUI proof child: inherit this completed conversation; do not modify files.';
  await click('[aria-label="Fork trusted conversation"] form textarea'); await wc.insertText(childText);
  await click('[aria-label="Fork trusted conversation"] form button', 'Fork child conversation');
  await until(() => run(parent => {
    const selected = document.querySelector('.trusted-selected-run')?.dataset.runToken;
    return selected && selected !== parent;
  }, parentToken), 'acknowledged child auto-selection');
  const childToken = await run(() => document.querySelector('.trusted-selected-run').dataset.runToken);
  assert.notEqual(childToken, parentToken);
  await until(() => text('.trusted-output').then(value => value.includes('Deterministic fork child ready')), 'actual child provider output');
  await until(() => status().then(value => value === 'ready'), 'completed child');
  await until(() => run(() => document.querySelectorAll('.trusted-fleet-list button').length === 2), 'exact two actual runs');
  const child = await snapshot(childToken), lineage = child.runs.find(row => row.runToken === childToken).fork;
  assert.deepEqual(lineage, { parentRunToken: parentToken, parentThreadId: parent.threadId, parentTurnId: parent.turnId,
    sharedWorkspace: true, inheritedTaskReference: null, confirmed: true });
  assert.equal(child.threadId, 'fork-gui-thread-child'); assert.notEqual(child.threadId, parent.threadId);
  assert.equal(child.workspace, parent.workspace); assert.equal(child.workspace, fixture.root);
  await until(() => text('.trusted-fork-lineage').then(value => value.includes('Fork of ' + spec) && value.includes('shared workspace')), 'confirmed lineage visible');
  await shot('01-confirmed-native-child.png');
  const initialWire = await providerWire();
  assert.equal(initialWire.filter(row => row.event === 'start').length, 2);
  assert.equal(initialWire.filter(row => row.event === 'exit').length, 0);
  assert.equal(new Set(initialWire.filter(row => row.event === 'start').map(row => row.namespace)).size, 2);
  assert.deepEqual(initialWire.filter(row => row.method === 'thread/fork').map(row => row.params), [{ threadId: parent.threadId,
    lastTurnId: parent.turnId, cwd: fixture.root, excludeTurns: true, deferGoalContinuation: true, ephemeral: false }]);
  const goals = initialWire.filter(row => ['thread/goal/clear', 'thread/goal/get'].includes(row.method));
  assert.deepEqual(goals.map(row => [row.role, row.method, row.params]), [
    ['child', 'thread/goal/clear', { threadId: child.threadId }], ['child', 'thread/goal/get', { threadId: child.threadId }],
  ]);

  stage = 'stop-child-parent-unchanged';
  await click('.trusted-local button', 'Stop conversation');
  await until(() => status().then(value => value === 'closed'), 'child confirmed Stop');
  await select(parentToken); assert.equal(await status(), 'ready');
  const retainedParent = await snapshot(parentToken);
  assert.equal(retainedParent.output, parent.output); assert.equal(retainedParent.threadId, parent.threadId); assert.equal(retainedParent.turnId, parent.turnId);
  await until(async () => (await providerWire()).some(row => row.role === 'child' && row.event === 'exit'), 'child peer exit');
  assert(!(await providerWire()).some(row => row.role === 'parent' && row.event === 'exit'));
  await shot('02-child-stopped-parent-ready.png');
  stage = 'explicit-parent-stop-and-archives';
  await click('.trusted-local button', 'Stop conversation');
  await until(() => status().then(value => value === 'closed'), 'parent confirmed Stop');
  const observed = [await snapshot(parentToken), await snapshot(childToken)];
  assert(observed.every(value => value.archived && value.status === 'closed' && !value.forkPoint && value.runs.length === 2));
  assert.deepEqual(observed[1].runs.find(row => row.runToken === childToken).fork, lineage);
  await select(childToken);
  assert((await text('.trusted-archive')).includes('No automatic resume or replay'));
  assert((await text('.trusted-fork-lineage')).includes('Fork of ' + spec));
  assert(await run(() => !document.querySelector('.trusted-selected-run textarea') &&
    ![...document.querySelectorAll('.trusted-selected-run button')].some(e => /Send|Steer|Stop|Allow/.test(e.textContent))));
  const after = await retained(); assert.deepEqual(after, before, 'source, logical cursor and cameras retained');
  const draftAfter = await run(() => ({ value: document.querySelector('.agent-draft textarea')?.value,
    domRetained: window.__forkRetained.draft === document.querySelector('.agent-draft textarea') }));
  assert.equal(draftAfter.value, spec); assert.equal(draftAfter.domRetained, true);
  assert(await run(() => window.__forkRetained.source === document.querySelector('.cm-content') &&
    window.__forkRetained.graphs.every((element, index) => element === document.querySelectorAll('.react-flow')[index])));
  assert.equal(await fs.readFile(path.join(fixture.root, 'proof.ts'), 'utf8'), fixture.sourceText);
  assert.deepEqual(rendererErrors, []);
  await shot('03-archived-native-lineage.png');
  for (const [name, value] of Object.entries({ 'after.json': after, 'draft-after.json': draftAfter, 'observations.json': observed }))
    await fs.writeFile(path.join(evidence, name), JSON.stringify(value, null, 2));
  await fs.writeFile(path.join(evidence, 'ui-proof.json'), JSON.stringify({ ok: true,
    scope: 'Actual packaged main/preload/core/service and ordinary Fork UI; two deterministic external peers, no IPC interception or model',
    packagedCore: true, ordinaryUiFork: true, modelTurns: 0, providerStarts: 2, protocolTurns: 2,
    nativeLineage: true, childGoalOnly: true, childAutoSelected: true, sourceRetained: true, camerasRetained: true,
    graphDomRetained: true, logicalCursorRetained: true, draftRetained: true, childStopPreservesParent: true,
    bothExplicitlyStopped: true, tokens: { parent: parentToken, child: childToken }, lineage, rendererErrors, elapsedMs: Date.now() - started }, null, 2));

  stage = 'native-app-close-after-confirmed-stops';
  await until(() => fs.access(path.join(evidence, 'request-app-close')).then(() => true, () => false), 'owned screenshot before close', 15000);
  // Preservation has been established. This editor does not install undo history.
  // Restore only the disposable buffer through ordinary text input so the dirty
  // veto need not be bypassed; never write the file or modify user data.
  await click('.cm-content'); await key('A', ['control']); await wc.insertText(fixture.sourceText);
  await until(() => run(expected => document.querySelector('.cm-content').cmView.view.state.doc.toString() === expected, fixture.sourceText), 'disposable buffer restored');
  // The separate unsent draft is intentionally protected too. Clear only the
  // proof's own draft after its retention was asserted; preserve the real veto.
  await click('.agent-reload-guard summary', 'Inspect local agent intent / refresh options');
  await click('.agent-reload-guard button', 'Clear local agent drafts and instruction text');
  await until(() => run(() => !document.querySelector('.agent-reload-guard') && !document.querySelector('.agent-draft')), 'disposable draft explicitly cleared');
  assert.deepEqual(rendererErrors, []);
  await fs.writeFile(path.join(evidence, 'app-close-requested'), 'Both sessions explicitly stopped; native window close requested.\n');
  win.close();
}
main().catch(async error => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) await fs.writeFile(path.join(evidence, 'failure-ui.txt'), await win.webContents.executeJavaScript('document.body.textContent')).catch(() => {});
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ stage, error: error.stack, rendererErrors }, null, 2));
  console.error(error);
});
