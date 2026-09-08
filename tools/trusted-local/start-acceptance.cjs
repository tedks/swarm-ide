// Actual packaged app and local core, deterministic Codex protocol peer only.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const evidence = process.env.SWARM_TRUSTED_EVIDENCE, errors = [];
let stage = 'startup';
app.on('web-contents-created', (_, wc) => wc.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); }));
require(path.join(process.env.SWARM_TRUSTED_PACKAGE, 'app/electron/main.js'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label) { for (let i = 0; i < 375; i++) { if (await check()) return; await delay(40); } throw new Error(`Timed out: ${label}`); }
async function main() {
  await app.whenReady();
  await until(() => fs.access(path.join(evidence, 'window-selected')).then(() => true, () => false), 'owned window');
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents, start = Date.now();
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const click = async (selector) => {
    await until(() => run((s) => Boolean(document.querySelector(s)), selector), selector);
    await run((s) => document.querySelector(s).scrollIntoView({ block: 'nearest' }), selector); await paint();
    const point = await run((s) => { const el = document.querySelector(s), r = el.getBoundingClientRect(), x = (Math.max(0,r.left)+Math.min(innerWidth,r.right))/2, y = (Math.max(0,r.top)+Math.min(innerHeight,r.bottom))/2;
      if (el.disabled || !el.contains(document.elementFromPoint(x, y))) throw new Error(`Occluded ${s}`); return { x: Math.round(x), y: Math.round(y) }; }, selector);
    wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point }); wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point }); await paint();
  };
  const key = async (keyCode, modifiers = []) => { wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); if (keyCode === 'Enter') wc.sendInputEvent({ type: 'char', keyCode: '\r', modifiers }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await paint(); };
  const text = (s) => run((selector) => document.querySelector(selector)?.textContent ?? '', s);
  const fixture = JSON.parse(await fs.readFile(path.join(evidence, 'fixture.json'), 'utf8'));
  win.focus(); wc.focus();
  await until(() => run(() => document.querySelector('select[aria-label="Worktree"]')?.options.length >= 2), 'registered worktree');
  assert.equal(await run(() => Boolean(document.querySelector('.cm-content'))), false, 'no source open');
  stage = 'selected-worktree';
  await run(() => document.querySelector('select[aria-label="Worktree"]').focus()); await key('Down'); await key('Enter');
  await until(() => text('.worktree-global').then((value) => value.includes('Selected worker')), 'selected registered worktree');
  await click('.agent-new-button');
  await until(() => run(() => document.activeElement?.getAttribute('aria-label') === 'New agent message'), 'new-agent composer focus');
  const prompt = 'Inspect proof.ts\nKeep this a deterministic proof';
  await wc.insertText('Inspect proof.ts'); await key('Enter', ['shift']); await wc.insertText('Keep this a deterministic proof');
  assert.equal(await run(() => document.querySelector('[aria-label="New agent message"]').value), prompt);
  assert.equal(await fs.access(path.join(fixture.root, '.proof-wire.jsonl')).then(() => true, () => false), false, 'no provider before Enter');
  const cameras = await run(() => [...document.querySelectorAll('.react-flow__viewport')].map((node) => node.style.transform));
  await fs.writeFile(path.join(evidence, '01-new-agent.png'), (await wc.capturePage()).toPNG());
  stage = 'direct-start'; await key('Enter');
  await until(() => text('.trusted-output').then((value) => value.includes('Deterministic local output.')), 'normal direct start');
  await until(() => run(() => Boolean(document.querySelector('.trusted-approval'))), 'normal approval');
  assert.equal(await run(() => document.activeElement?.getAttribute('aria-label')), 'Message Codex');
  assert((await text('.trusted-workspace')).includes(fixture.root));
  await click('.trusted-approval button');
  await until(() => text('.trusted-local header small').then((value) => value === 'ready'), 'first turn ready');
  assert.deepEqual(await run(() => [...document.querySelectorAll('.react-flow__viewport')].map((node) => node.style.transform)), cameras, 'starting an agent retains graph cameras');
  await fs.writeFile(path.join(evidence, '02-running-agent.png'), (await wc.capturePage()).toPNG());
  stage = 'reload'; wc.reload();
  await until(() => run(() => Boolean(document.querySelector('.agent-new-button'))), 'reloaded shell');
  await click('.agent-new-button');
  await until(() => run(() => Boolean(document.querySelector('.trusted-fleet-list button'))), 'retained conversation');
  await click('.trusted-fleet-list button');
  await until(() => text('.trusted-output').then((value) => value.includes('Approval received exactly once.')), 'same conversation after reload');
  assert((await text('.trusted-outgoing')).includes(prompt));
  stage = 'navigate-and-send';
  await run(() => document.querySelector('select[aria-label="Worktree"]').focus()); await key('Home'); await key('Enter');
  await until(() => text('.repository-navigation').then((value) => !value.includes('selected-worktree')), 'primary directory');
  await click('[aria-label="Message Codex"]'); await wc.insertText('Second deterministic message'); await key('Enter');
  await until(() => text('.trusted-output').then((value) => value.includes('Second turn stays active for Stop.')), 'send still targets captured worktree');
  await run(() => [...document.querySelectorAll('.trusted-local button')].find((b) => b.textContent === 'Stop conversation').focus()); await key('Enter');
  await until(() => text('.trusted-local header small').then((value) => value === 'closed'), 'owned Stop');
  const wire = (await fs.readFile(path.join(fixture.root, '.proof-wire.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(wire.filter((row) => row.event === 'start').length, 1);
  assert.equal(wire.find((row) => row.event === 'start').cwd, fixture.root);
  assert.equal(wire.filter((row) => row.method === 'thread/start').length, 1);
  assert.equal(wire.filter((row) => row.method === 'turn/start').length, 2);
  assert.equal(wire.find((row) => row.method === 'turn/start').params.input[0].text, prompt);
  assert.equal(wire.filter((row) => row.method === 'turn/interrupt').length, 1);
  assert(!wire.some((row) => row.event === 'failure'));
  assert.equal(await fs.access(path.join(fixture.primary, '.proof-wire.jsonl')).then(() => true, () => false), false);
  assert.equal(await fs.readFile(path.join(fixture.root, 'proof.ts'), 'utf8'), fixture.sourceText);
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(evidence, 'wire.json'), JSON.stringify(wire, null, 2));
  await fs.writeFile(path.join(evidence, 'proof.json'), JSON.stringify({ ok: true, packagedCore: true, modelTurns: 0, providerStarts: 1,
    deterministicProtocolTurns: 2, selectedWorktree: true, sourceNotRequired: true, reloadNoReplay: true, outgoingRetained: true,
    sendAfterNavigation: true, sourceRetained: true, camerasRetained: true, initialCameraCount: cameras.length,
    sessionClosed: true, rendererErrors: errors, elapsedMs: Date.now() - start }, null, 2));
}
main().catch(async (error) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) { await fs.writeFile(path.join(evidence, 'failure.png'), (await win.webContents.capturePage()).toPNG()).catch(() => {}); await fs.writeFile(path.join(evidence, 'failure-ui.txt'), await win.webContents.executeJavaScript('document.body.textContent')).catch(() => {}); }
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ stage, error: error.stack, rendererErrors: errors }, null, 2));
  console.error(error);
});
