// TEST ONLY. Actual packaged main/preload/core/service, no trusted IPC interception.
// Two bounded deterministic app-server peers; no installed Codex or model.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const evidence = process.env.SWARM_TRUSTED_EVIDENCE;
const rendererErrors = [];
let stage = 'startup';
app.on('web-contents-created', (_event, wc) => {
  wc.on('console-message', (event) => { if (event.level === 'error') rendererErrors.push(event.message.slice(0, 4096)); });
  wc.on('render-process-gone', (_event, details) => rendererErrors.push(`Renderer gone: ${details.reason}`));
});
require(path.join(process.env.SWARM_TRUSTED_PACKAGE, 'app/electron/main.js'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
    addEventListener('error', (event) => console.error(event.error?.stack ?? event.message));
    addEventListener('unhandledrejection', (event) => console.error(event.reason?.stack ?? event.reason));
  });
  const click = async (selector, label = null) => {
    const point = await run((s, t) => {
      const element = [...document.querySelectorAll(s)].find((node) => t === null || node.textContent.trim() === t);
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
  const text = (selector) => run((s) => document.querySelector(s)?.textContent ?? '', selector);
  const status = () => text('.trusted-local header small');
  const camera = () => run(() => [...document.querySelectorAll('.react-flow__viewport')].map((e) => e.style.transform));
  const shot = async (name) => fs.writeFile(path.join(evidence, name), (await wc.capturePage()).toPNG());
  stage = 'source';
  await until(() => run(() => Boolean(document.querySelector('[aria-label="Open file proof.ts"]'))), 'real disposable file listing');
  await click('[aria-label="Open file proof.ts"]');
  await until(() => run(() => Boolean(document.querySelector('.cm-content'))), 'source open');
  await click('.cm-content'); await key('End', ['control']); await wc.insertText('// unsaved proof buffer');
  await until(() => text('.cm-content').then((value) => value.includes('unsaved proof buffer')), 'dirty buffer');
  const source = await text('.cm-content'), cameras = await camera();
  await run(() => { window.__trustedRetained = { source: document.querySelector('.cm-content'), graphs: [...document.querySelectorAll('.react-flow')] }; });

  const retained = () => run(() => {
    const view = document.querySelector('.cm-content')?.cmView?.view;
    if (!view) throw new Error('CodeMirror logical state unavailable');
    return {source:view.state.doc.toString(), selection:view.state.selection.toJSON(),
      cameras:[...document.querySelectorAll('.react-flow__viewport')].map(e => e.style.transform),
      graphCount:document.querySelectorAll('.react-flow').length};
  });
  const before = await retained();
  await fs.writeFile(path.join(evidence, 'before.json'), JSON.stringify(before, null, 2));
  stage = 'fixed-draft';
  await click('.agent-dock-welcome .agent-primary');
  await until(() => run(() => Boolean(document.querySelector('.agent-draft textarea'))), 'agent instruction draft');
  const spec = 'Joined service proof: preserve this independent agent draft.';
  await click('.agent-draft textarea'); await key('A', ['control']); await wc.insertText(spec);
  await click('.agent-draft input[placeholder="Provider default (unresolved)"]'); await key('A', ['control']); await key('Backspace');
  const draftBefore = await run(() => {
    const draft = document.querySelector('.agent-draft textarea');
    window.__trustedRetained.draft = draft;
    return {value:draft.value};
  });
  assert.equal(draftBefore.value, spec);
  await fs.writeFile(path.join(evidence, 'draft-before.json'), JSON.stringify(draftBefore, null, 2));
  const providerWire = async () => (await fs.readFile(path.join(evidence, 'provider-wire.jsonl'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(JSON.parse);
  const launch = async (role, count) => {
    stage = 'prepare-' + role;
    const countBefore = (await providerWire()).filter(row => row.event === 'start').length;
    assert.equal(countBefore, count - 1);
    await click('.trusted-local button', 'Prepare trusted-local context');
    await until(() => run(() => Boolean(document.querySelector('.trusted-review'))), 'exact prepared context ' + role);
    const prompt = await text('.trusted-review pre');
    assert(prompt.includes('proof.ts')); assert(prompt.includes(spec)); assert(!prompt.includes('unsaved proof buffer'));
    assert(await run(() => [...document.querySelectorAll('.trusted-review button')].find(e => e.textContent === 'Launch trusted-local Codex').disabled));
    assert.equal((await providerWire()).filter(row => row.event === 'start').length, countBefore, 'Prepare never starts a provider');
    await click('.trusted-review input[type="checkbox"]');
    stage = 'launch-' + role;
    await click('.trusted-review button', 'Launch trusted-local Codex');
    await until(() => text('.trusted-output').then(value => value.includes('Deterministic ' + role + ' turn 1')), 'actual protocol output ' + role);
    await until(() => run(expected => document.querySelectorAll('.trusted-fleet-list button').length === expected, count), 'actual service fleet size');
    await until(() => status().then(value => value === (role === 'A' ? 'running' : 'ready')), 'settled role status');
    return run(() => document.querySelector('.trusted-selected-run').dataset.runToken);
  };
  const tokenA = await launch('A', 1);
  await click('.trusted-local textarea'); await wc.insertText('A unsent composer');
  await click('.trusted-local button', 'New conversation');
  const tokenB = await launch('B', 2); assert.notEqual(tokenA, tokenB);
  await click('.trusted-local textarea'); await wc.insertText('B only next turn');
  const select = async token => {
    await click('.trusted-fleet-list button[data-run-token="' + token + '"]');
    await until(() => run(t => document.querySelector('.trusted-selected-run')?.dataset.runToken === t, token), 'exact selected run');
  };
  const composer = () => run(() => document.querySelector('.trusted-local textarea')?.value);
  stage = 'selection';
  await select(tokenA); assert.equal(await composer(), 'A unsent composer');
  assert((await text('.trusted-output')).includes('Deterministic A turn 1'));
  assert(!(await text('.trusted-output')).includes('Deterministic B'));
  await select(tokenB); assert.equal(await composer(), 'B only next turn');
  assert((await text('.trusted-output')).includes('Deterministic B turn 1'));
  assert((await text('.trusted-live-activity')).includes('Reading files (shell command)'));
  await shot('01-two-live.png');
  stage = 'stop-A';
  await select(tokenA); await click('.trusted-local button', 'Stop conversation');
  await until(() => status().then(value => value === 'closed'), 'A confirmed stopped');
  await select(tokenB); assert.equal(await status(), 'ready'); assert.equal(await composer(), 'B only next turn');
  const afterA = await providerWire();
  assert.equal(afterA.filter(row => row.method === 'turn/interrupt' && row.role === 'A').length, 1);
  assert.equal(afterA.filter(row => row.method === 'turn/interrupt' && row.role === 'B').length, 0);
  assert.equal(afterA.filter(row => row.event === 'exit' && row.role === 'B').length, 0);
  stage = 'next-turn-B';
  await click('.trusted-local form button', 'Send next turn');
  await until(() => text('.trusted-output').then(value => value.includes('Deterministic B turn 2')), 'B-only actual next turn');
  await until(() => composer().then(value => value === ''), 'B composer acknowledged');
  await until(() => status().then(value => value === 'running'), 'B next turn running');
  stage = 'stop-B'; await click('.trusted-local button', 'Stop conversation');
  await until(() => status().then(value => value === 'closed'), 'B confirmed stopped');
  stage = 'archived-observation';
  await select(tokenA);
  assert((await text('.trusted-archive')).includes('No automatic resume or replay'));
  assert((await text('.trusted-selected-run')).includes('A unsent composer'));
  await select(tokenB); await click('.trusted-local button', 'Observe conversations');
  assert(await run(() => !document.querySelector('.trusted-selected-run textarea') &&
    ![...document.querySelectorAll('.trusted-selected-run button')].some(e => /Send|Steer|Stop|Allow/.test(e.textContent))));
  // Read-only observations traverse the same real preload/core schemas; no handler interception.
  const observed = await run(async tokens => {
    const result = [];
    for (const token of tokens) {
      const response = await window.swarm.request({protocolVersion:7, requestId:'joined-proof:' + crypto.randomUUID(), type:'trusted.snapshot', token});
      if (!response.ok || !response.trusted) throw new Error('Real archived snapshot unavailable');
      result.push(response.trusted.snapshot);
    }
    return result;
  }, [tokenA, tokenB]);
  assert.deepEqual(observed.map(s => s.runToken), [tokenA, tokenB]);
  assert(observed.every(s => s.status === 'closed' && s.archived && s.runs.length === 2));
  assert.equal(observed[0].threadId, 'joined-thread-A'); assert.equal(observed[1].threadId, 'joined-thread-B');
  const identity = require('node:crypto').createHash('sha256').update(fixture.root).digest('hex');
  const historyPath = path.join(fixture.stateHome, 'swarm-ide/trusted-local', identity + '.json');
  let history;
  await until(async () => {
    try { history = JSON.parse(await fs.readFile(historyPath, 'utf8')); return history.runs.length === 2 &&
      history.runs.every(r => r.summary.status === 'closed' && r.summary.archived); } catch { return false; }
  }, 'two persisted closed histories');
  assert.deepEqual(history.runs.map(r => r.summary.runToken), [tokenA, tokenB]);
  assert(history.runs[1].output.includes('Deterministic B turn 2'));
  await until(async () => (await providerWire()).filter(row => row.event === 'exit').length === 2, 'two owned provider exits');
  const wire = await providerWire();
  assert.equal(wire.filter(row => row.event === 'start').length, 2);
  assert.equal(wire.filter(row => row.method === 'thread/start').length, 2);
  assert.equal(wire.filter(row => row.method === 'turn/start').length, 3);
  assert.equal(wire.filter(row => row.method === 'turn/start' && row.role === 'A').length, 1);
  assert.equal(wire.filter(row => row.method === 'turn/start' && row.role === 'B').length, 2);
  assert.equal(wire.filter(row => row.method === 'turn/interrupt').length, 2);
  assert(!wire.some(row => row.event === 'failure'));
  assert(wire.filter(row => row.event === 'exit').every(row => row.code === 0));
  const after = await retained(); assert.deepEqual(after, before, 'full source/logical cursor and cameras retained');
  const draftAfter = await run(() => ({value:document.querySelector('.agent-draft textarea')?.value,
    domRetained:window.__trustedRetained.draft === document.querySelector('.agent-draft textarea')}));
  assert.equal(draftAfter.value, spec); assert.equal(draftAfter.domRetained, true);
  assert(await run(() => window.__trustedRetained.source === document.querySelector('.cm-content') &&
    window.__trustedRetained.graphs.every((element, index) => element === document.querySelectorAll('.react-flow')[index])));
  assert.equal(await fs.readFile(path.join(fixture.root, 'proof.ts'), 'utf8'), fixture.sourceText);
  assert.deepEqual(rendererErrors, []);
  for (const [name, value] of Object.entries({'after.json':after, 'draft-after.json':draftAfter,
    'observations.json':observed, 'history.json':history, 'wire.json':wire}))
    await fs.writeFile(path.join(evidence, name), JSON.stringify(value, null, 2));
  await shot('02-two-archived.png');
  await fs.writeFile(path.join(evidence, 'proof.json'), JSON.stringify({ok:true,
    scope:'Actual packaged cockpit/preload/core/trusted service/history; bounded deterministic app-server protocol peers, no trusted IPC interception or model',
    packagedCore:true, modelTurns:0, providerStarts:2, protocolTurns:3, sourceRetained:true, camerasRetained:true,
    graphDomRetained:true, logicalCursorRetained:true, draftRetained:true, composerIsolation:true, exactTargetStop:true,
    nextTurnBOnly:true, bothStopped:true, persistedTwoArchives:true, archiveReadOnly:true, activityVisible:true,
    noReplay:true, noReplayScope:'Closed archive observation in the same core; no core restart tested',
    tokens:{A:tokenA,B:tokenB}, rendererErrors, elapsedMs:Date.now()-started}, null, 2));
}
main().catch(async (error) => {
  const fixture = JSON.parse(await fs.readFile(path.join(evidence, 'fixture.json'), 'utf8'));
  await fs.copyFile(path.join(fixture.root, '.proof-wire.jsonl'), path.join(evidence, 'failure-wire.jsonl')).catch(() => {});
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) await fs.writeFile(path.join(evidence, 'failure-ui.txt'), await win.webContents.executeJavaScript('document.body.textContent'));
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ stage, error: error.stack, rendererErrors }, null, 2));
  console.error(error);
});
