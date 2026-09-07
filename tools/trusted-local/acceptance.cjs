// TEST ONLY. Unchanged packaged main/core/preload; only the provider executable
// is a deterministic peer. UI gestures start after owned X11 window selection.
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
  stage = 'prepare';
  await click('.agent-dock-welcome .agent-primary');
  await until(() => run(() => Boolean(document.querySelector('.agent-draft textarea'))), 'existing unlaunched draft');
  // Keep the fixture independent of any configured real model name.
  await click('.trusted-local button', 'Prepare trusted-local context');
  await until(() => run(() => Boolean(document.querySelector('.trusted-review'))), 'prepared exact context');
  assert((await text('.trusted-review')).includes('proof.ts'));
  assert(!(await text('.trusted-review')).includes('unsaved proof buffer'));
  assert(await run(() => [...document.querySelectorAll('.trusted-review button')].find((node) => node.textContent === 'Launch trusted-local Codex').disabled));
  assert.equal(await fs.access(path.join(fixture.root, '.proof-wire.jsonl')).then(() => true, () => false), false, 'prepare never starts provider');
  await click('.trusted-review input[type="checkbox"]');
  stage = 'launch';
  await click('.trusted-review button', 'Launch trusted-local Codex');
  await until(() => text('.trusted-output').then((value) => value.includes('Deterministic local output.')), 'actual protocol output');
  await until(() => run(() => Boolean(document.querySelector('.trusted-approval'))), 'approval surfaced');
  assert((await text('.trusted-approval')).includes('printf proof-only'));
  await run(() => document.querySelector('.trusted-approval').scrollIntoView({ block: 'end' }));
  await delay(80);
  await shot('01-approval.png');
  stage = 'approval'; await click('.trusted-approval button', 'Allow once');
  await until(async () => await status() === 'ready', 'completed first turn');
  assert((await text('.trusted-output')).includes('Approval received exactly once.'));
  stage = 'next-turn';
  await click('.trusted-local textarea'); await wc.insertText('Second deterministic message');
  await click('.trusted-local form button', 'Send next turn');
  await until(() => text('.trusted-output').then((value) => value.includes('Second turn stays active for Stop.')), 'next turn output');
  stage = 'stop'; await click('.trusted-local button', 'Stop conversation');
  await until(async () => await status() === 'closed', 'confirmed owned session shutdown');
  assert.equal(await text('.cm-content'), source, 'source buffer unchanged');
  assert.deepEqual(await camera(), cameras, 'independent graph cameras unchanged');
  assert(await run(() => window.__trustedRetained.source === document.querySelector('.cm-content') && window.__trustedRetained.graphs.every((element, index) => element === document.querySelectorAll('.react-flow')[index])), 'source/graph DOM retained');
  assert.equal(await fs.readFile(path.join(fixture.root, 'proof.ts'), 'utf8'), fixture.sourceText, 'unsaved edits never written');
  const wire = (await fs.readFile(path.join(fixture.root, '.proof-wire.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(wire.filter((row) => row.event === 'start').length, 1, 'exactly one provider process');
  assert.equal(wire.filter((row) => row.method === 'thread/start').length, 1);
  assert.equal(wire.filter((row) => row.method === 'turn/start').length, 2);
  assert.equal(wire.filter((row) => row.id === 'proof-approval').length, 1);
  assert.equal(wire.filter((row) => row.method === 'turn/interrupt').length, 1);
  assert(!wire.some((row) => row.event === 'failure'));
  await fs.writeFile(path.join(evidence, 'wire.json'), JSON.stringify(wire, null, 2));
  await run(() => document.querySelector('.trusted-notice').scrollIntoView({ block: 'end' }));
  await delay(80);
  await shot('02-stopped.png'); assert.deepEqual(rendererErrors, []);
  await fs.writeFile(path.join(evidence, 'proof.json'), JSON.stringify({ ok: true, packagedCore: true, modelTurns: 0,
    providerStarts: 1, deterministicProtocolTurns: 2, approvalReplies: 1, sourceRetained: true, camerasRetained: true,
    sessionClosed: true, rendererErrors, elapsedMs: Date.now() - started }, null, 2));
}
main().catch(async (error) => {
  const fixture = JSON.parse(await fs.readFile(path.join(evidence, 'fixture.json'), 'utf8'));
  await fs.copyFile(path.join(fixture.root, '.proof-wire.jsonl'), path.join(evidence, 'failure-wire.jsonl')).catch(() => {});
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) await fs.writeFile(path.join(evidence, 'failure-ui.txt'), await win.webContents.executeJavaScript('document.body.textContent'));
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ stage, error: error.stack, rendererErrors }, null, 2));
  console.error(error);
});
