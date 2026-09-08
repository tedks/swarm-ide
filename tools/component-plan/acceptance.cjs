// Packaged UI/core proof with a labelled controlled provider, zero model turns.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const evidence = process.env.SWARM_PLAN_UI_EVIDENCE, rendererErrors = [];
let stage = 'startup';
app.on('web-contents-created', (_event, wc) => {
  wc.on('console-message', event => { if (event.level === 'error') rendererErrors.push(event.message.slice(0, 4096)); });
  wc.on('render-process-gone', (_event, details) => rendererErrors.push(`Renderer gone: ${details.reason}`));
});
require(path.join(process.env.SWARM_PLAN_PACKAGE, 'app/electron/main.js'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await delay(40); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const fixture = JSON.parse(await fs.readFile(path.join(evidence, 'fixture.json'), 'utf8'));
  await app.whenReady(); assert.equal(app.getPath('userData'), process.env.SWARM_PLAN_PROFILE);
  await until(() => fs.access(path.join(evidence, 'window-selected')).then(() => true, () => false), 'owned selection', 30000);
  const wc = BrowserWindow.getAllWindows()[0].webContents, started = Date.now();
  assert(wc.getURL().startsWith('file:'));
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => { addEventListener('error', e => console.error(e.error?.stack ?? e.message)); addEventListener('unhandledrejection', e => console.error(e.reason?.stack ?? e.reason)); });
  const text = selector => run(s => document.querySelector(s)?.textContent ?? '', selector);
  const click = async (selector, label = null) => {
    const point = await run((s, t) => {
      const el = [...document.querySelectorAll(s)].find(n => t === null || n.textContent.trim() === t);
      if (!el || el.disabled) throw new Error(`Unavailable ${s}: ${t}`);
      el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (!r.width || !r.height || !el.contains(document.elementFromPoint(x, y))) throw new Error(`Occluded ${s}: ${t}`);
      return { x: Math.round(x), y: Math.round(y) };
    }, selector, label);
    wc.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 }); await delay(80);
  };
  await until(() => text('.plan-generation').then(t => t.includes('Generate component plan')), 'missing-plan action');
  assert.equal(await fs.access(path.join(evidence, 'wire.jsonl')).then(() => true, () => false), false);
  stage = 'retained source';
  await click('[aria-label="Open file proof.ts"]'); await until(() => text('.cm-content').then(Boolean), 'source');
  await click('.cm-content'); await wc.insertText('// unsaved plan proof\n');
  const source = await text('.cm-content'); assert(source.includes('unsaved plan proof'));
  await run(() => { window.__planSource = document.querySelector('.cm-content'); });
  stage = 'generate'; await click('.plan-generation button', 'Generate component plan');
  await until(() => text('.trusted-output').then(t => t.includes('Controlled provider')), 'visible normal agent');
  await fs.writeFile(path.join(evidence, 'generating.png'), (await wc.capturePage()).toPNG());
  await until(() => text('[aria-label="Component design"]').then(t => t.includes('Proof system')), 'validated generated graph');
  assert.equal(await run(() => Boolean(document.querySelector('.plan-generation'))), false);
  assert.equal(await text('.cm-content'), source); assert(await run(() => window.__planSource === document.querySelector('.cm-content')));
  assert.equal(await fs.readFile(path.join(fixture.root, 'proof.ts'), 'utf8'), fixture.sourceText);
  assert((await fs.readFile(path.join(fixture.root, 'docs/design/system.md'), 'utf8')).includes('controlled design'));
  stage = 'stop'; await click('.trusted-local button', 'Stop conversation');
  await until(() => text('.trusted-local header small').then(t => t === 'closed'), 'owned closed session');
  const wire = (await fs.readFile(path.join(evidence, 'wire.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(wire.filter(r => r.event === 'start').length, 1); assert.equal(wire.filter(r => r.method === 'turn/start').length, 1); assert(!wire.some(r => r.event === 'failure'));
  assert.deepEqual(rendererErrors, []);
  await fs.writeFile(path.join(evidence, 'generated-plan.png'), (await wc.capturePage()).toPNG());
  await fs.writeFile(path.join(evidence, 'proof.json'), JSON.stringify({ ok: true, modelTurns: 0, providerStarts: 1, sourceRetained: true, sessionClosed: true, rendererErrors, elapsedMs: Date.now() - started }, null, 2));
}
main().catch(async error => {
  const wc = BrowserWindow.getAllWindows()[0]?.webContents;
  if (wc && !wc.isDestroyed()) { await fs.writeFile(path.join(evidence, 'failure-ui.txt'), await wc.executeJavaScript('document.body.textContent')); await fs.writeFile(path.join(evidence, 'failure.png'), (await wc.capturePage()).toPNG()); }
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ stage, error: error.stack, rendererErrors }, null, 2)); console.error(error);
});
