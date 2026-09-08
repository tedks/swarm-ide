// TEST ONLY. Synthetic trusted IPC responses; packaged main, preload and real core handle all other requests.
// No provider executable/model. UI gestures start after owned X11 window selection.
const { app, BrowserWindow, ipcMain } = require('electron');
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

const tokens = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
const wire = [];
let pendingSend, stoppedB = false;
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => originalHandle(channel, channel !== 'swarm:request' ? handler : async (event, input) => {
  if (!input?.type?.startsWith('trusted.')) return handler(event, input);
  wire.push({...input});
  assert(['trusted.snapshot', 'trusted.send', 'trusted.stop'].includes(input.type), 'No provider-launch path permitted');
  const base = await handler(event, { protocolVersion: input.protocolVersion, requestId: input.requestId, type: 'trusted.snapshot' });
  assert(base.response.ok);
  const token = input.token ?? tokens[0], index = tokens.indexOf(token);
  assert(index >= 0);
  if (input.type === 'trusted.send') {
    assert.equal(token, tokens[0]); assert.equal(input.expectedTurnId, 'turn-A');
    await new Promise((resolve) => { pendingSend = resolve; });
  }
  if (input.type === 'trusted.stop') { assert.equal(token, tokens[1]); stoppedB = true; }
  const at = '2026-09-07T12:00:00.000Z';
  const runs = tokens.map((runToken, i) => ({runToken, title: ['Controlled run A', 'Controlled run B', 'Controlled archive'][i],
    createdAt: at, updatedAt: at, status: i === 2 || (i === 1 && stoppedB) ? 'closed' : 'running',
    archived: i === 2, approvalCount: 0, taskReference: null, message: 'Explicitly synthetic test IPC observation'}));
  base.response.trusted = {kind: 'trusted', snapshot: {...base.response.trusted.snapshot,
    instanceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', preparation: null, runToken: token,
    status: runs[index].status, threadId: 'controlled-' + index, turnId: index === 2 ? null : 'turn-' + ['A','B'][index],
    output: 'Controlled output ' + ['A','B','archive'][index], message: 'Synthetic IPC fleet, real editor/core',
    approvals: [], runs, archived: index === 2, taskReference: null,
    activities: [{id: 'activity-' + index, at, turnId: null, kind: 'command', status: 'completed', summary: 'Controlled activity ' + ['A','B','archive'][index]}]}};
  return base;
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
    const content = document.querySelector('.cm-content');
    const view = content?.cmView?.view;
    if (!view) throw new Error('CodeMirror logical state unavailable');
    return {source: view.state.doc.toString(), selection: view.state.selection.toJSON(),
      cameras: [...document.querySelectorAll('.react-flow__viewport')].map(e => e.style.transform),
      graphCount: document.querySelectorAll('.react-flow').length};
  });
  const before = await retained();
  await fs.writeFile(path.join(evidence, 'before.json'), JSON.stringify(before, null, 2));
  stage = 'fleet-open';
  await click('.agent-dock-welcome .agent-primary');
  await until(() => run(() => Boolean(document.querySelector('.agent-draft textarea'))), 'ordinary agent instruction draft');
  const unsentSpec = 'Unsent fleet proof spec: preserve this independent agent instruction draft.';
  await click('.agent-draft textarea'); await key('A', ['control']); await wc.insertText(unsentSpec);
  const draftBefore = await run(() => {
    const draft = document.querySelector('.agent-draft textarea');
    window.__trustedRetained.draft = draft;
    return { value: draft.value };
  });
  assert.equal(draftBefore.value, unsentSpec);
  await fs.writeFile(path.join(evidence, 'draft-before.json'), JSON.stringify(draftBefore, null, 2));
  await until(() => run(() => document.querySelectorAll('.trusted-fleet-list button').length === 3), 'three controlled conversations');
  const select = async (i) => {
    await click('.trusted-fleet-list button[data-run-token="' + tokens[i] + '"]');
    await until(() => run((token) => document.querySelector('.trusted-selected-run')?.dataset.runToken === token, tokens[i]), 'selected exact run');
  };
  const composer = () => run(() => document.querySelector('.trusted-local textarea')?.value);
  await select(0); await click('.trusted-local textarea'); await wc.insertText('A retained draft');
  await select(1); await click('.trusted-local textarea'); await wc.insertText('B retained draft');
  await select(0); assert.equal(await composer(), 'A retained draft');
  stage = 'delayed-send';
  await click('.trusted-local form button', 'Steer current turn');
  await until(() => Boolean(pendingSend), 'A request held');
  await select(1); assert.equal(await composer(), 'B retained draft');
  pendingSend(); pendingSend = null;
  await until(() => text('.trusted-notice').then(v => !v.includes('unconfirmed')), 'ack settled');
  await delay(200);
  assert.equal(await composer(), 'B retained draft', 'A acknowledgement cannot clear B composer');
  assert.equal(await run(() => document.querySelector('.trusted-selected-run').dataset.runToken), tokens[1]);
  await select(0); await until(() => composer().then(v => v === ''), 'ack clears exact A draft');
  await select(1); assert.equal(await composer(), 'B retained draft');
  assert((await text('.trusted-live-activity')).includes('Controlled activity B'));
  stage = 'exact-stop';
  await click('.trusted-local button', 'Stop conversation');
  await until(() => status().then(v => v === 'closed'), 'B stopped');
  await select(0); assert.equal(await status(), 'running');
  assert.equal(wire.filter(r => r.type === 'trusted.stop').length, 1);
  assert.equal(wire.find(r => r.type === 'trusted.stop').token, tokens[1]);
  stage = 'archive';
  await select(2);
  assert((await text('.trusted-archive')).includes('No automatic resume or replay'));
  assert(await run(() => !document.querySelector('.trusted-selected-run textarea') &&
    ![...document.querySelectorAll('.trusted-selected-run button')].some(e => /Send|Steer|Stop|Allow/.test(e.textContent))));
  assert((await text('.trusted-live-activity')).includes('Controlled activity archive'));
  const draftAfter = await run(() => {
    const draft = document.querySelector('.agent-draft textarea');
    return { value: draft?.value, domRetained: window.__trustedRetained.draft === draft };
  });
  assert.equal(draftAfter.value, draftBefore.value, 'independent unsent agent instructions retained');
  assert.equal(draftAfter.domRetained, true, 'independent agent draft DOM retained');
  await fs.writeFile(path.join(evidence, 'draft-after.json'), JSON.stringify(draftAfter, null, 2));
  const after = await retained();
  assert.deepEqual(after, before, 'full logical editor/cursor and cameras retained');
  assert(await run(() => window.__trustedRetained.source === document.querySelector('.cm-content') &&
    window.__trustedRetained.graphs.every((element, index) => element === document.querySelectorAll('.react-flow')[index])));
  assert.equal(await fs.readFile(path.join(fixture.root, 'proof.ts'), 'utf8'), fixture.sourceText);
  assert.equal(wire.filter(r => r.type === 'trusted.send').length, 1);
  assert.deepEqual(rendererErrors, []);
  await fs.writeFile(path.join(evidence, 'after.json'), JSON.stringify(after, null, 2));
  await fs.writeFile(path.join(evidence, 'wire.json'), JSON.stringify(wire, null, 2));
  await shot('fleet-archive.png');
  await fs.writeFile(path.join(evidence, 'proof.json'), JSON.stringify({ok:true,
    scope:'Controlled synthetic trusted IPC; actual packaged renderer/preload and local-core file/editor/graphs',
    realCoreEditor:true, modelTurns:0, providerStarts:0, sourceRetained:true, camerasRetained:true,
    logicalCursorRetained:true, graphDomRetained:true, composerIsolation:true, delayedAcknowledgement:true,
    exactTargetStop:true, archiveReadOnly:true, activityVisible:true, draftRetained:true, rendererErrors, elapsedMs:Date.now()-started}, null, 2));
}
main().catch(async (error) => {
  const fixture = JSON.parse(await fs.readFile(path.join(evidence, 'fixture.json'), 'utf8'));
  await fs.copyFile(path.join(fixture.root, '.proof-wire.jsonl'), path.join(evidence, 'failure-wire.jsonl')).catch(() => {});
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) await fs.writeFile(path.join(evidence, 'failure-ui.txt'), await win.webContents.executeJavaScript('document.body.textContent'));
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ stage, error: error.stack, rendererErrors }, null, 2));
  console.error(error);
});
