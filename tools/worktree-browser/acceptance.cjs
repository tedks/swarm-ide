const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const evidence = process.env.SWARM_ARTIFACT_DIR, errors = [], writes = [];
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (name, listener) => handle(name, (event, input) => {
  if (name === 'swarm:request' && /send|launch|prepare|write|save|fork/.test(input.type)) writes.push(input.type);
  return listener(event, input);
});
app.on('web-contents-created', (_event, wc) => wc.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); }));
require(path.join(process.env.SWARM_WORKTREE_PACKAGE, 'app/electron/main.js'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label) { for (let n = 0; n < 300; n++) { if (await check()) return; await delay(40); } throw new Error(`Timed out: ${label}`); }
async function main() {
  await app.whenReady();
  await until(() => fs.access(path.join(evidence, 'window-selected')).then(() => true, () => false), 'owned window');
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents, start = Date.now();
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => { addEventListener('error', (e) => console.error(e.error?.stack ?? e.message)); addEventListener('unhandledrejection', (e) => console.error(e.reason)); });
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const click = async (selector) => {
    await until(() => run((s) => Boolean(document.querySelector(s)), selector), selector);
    await run((s) => document.querySelector(s).scrollIntoView({ block: 'nearest' }), selector); await paint();
    const point = await run((s) => { const el = document.querySelector(s), r = el.getBoundingClientRect(); const x = (Math.max(0, r.left) + Math.min(innerWidth, r.right)) / 2, y = (Math.max(0, r.top) + Math.min(innerHeight, r.bottom)) / 2;
      if (el.disabled || !el.contains(document.elementFromPoint(x, y))) throw new Error(`Blocked ${s} by ${document.elementFromPoint(x, y)?.outerHTML.slice(0, 200)}`); return { x: Math.round(x), y: Math.round(y) }; }, selector);
    wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point }); wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point }); await paint();
  };
  const button = async (region, text) => { await run((r, t) => { const el = [...document.querySelectorAll(`${r} button`)].find((b) => b.textContent.trim() === t); if (!el) throw new Error(`Missing ${t}`); el.dataset.proofClick = 'yes'; }, region, text); await click('[data-proof-click="yes"]'); await run(() => document.querySelector('[data-proof-click]')?.removeAttribute('data-proof-click')); };
  const source = () => run(() => { const state = document.querySelector('.source-surface .cm-content')?.cmView?.rootView?.view?.state; return state ? { text: state.doc.toString(), anchor: state.selection.main.anchor, head: state.selection.main.head } : null; });
  win.focus(); wc.focus();
  await click('.command-trigger'); await until(() => run(() => document.activeElement?.getAttribute('aria-label') === 'Workspace command'), 'palette focus');
  await wc.insertText('README.md'); await click('[data-file-search-path="README.md"]');
  await until(async () => (await source())?.text === '# Original operator source\n', 'real source');
  await click('.source-surface .cm-content'); wc.sendInputEvent({ type: 'keyDown', keyCode: 'End', modifiers: ['control'] }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'End', modifiers: ['control'] });
  await wc.insertText('Dirty operator note\n');
  await until(async () => (await source())?.text.endsWith('Dirty operator note\n'), 'dirty source');
  const retained = await source();
  const cameras = await run(() => { window.proofGraphs = [...document.querySelectorAll('.graphs-grid .react-flow')]; window.proofEditor = document.querySelector('.source-surface .cm-content'); return [...document.querySelectorAll('.graphs-grid .react-flow__viewport')].map((e) => e.style.transform); });
  for (const name of ['A', 'B']) {
    await click(`[data-worker="${name}"]`);
    await until(() => run((n) => document.querySelector('.agent-worktree-heading')?.textContent.includes(`Owned worker ${n}`), name), 'actual worker');
    await button('.worktree-file-list', '▸ src'); await button('.worktree-file-list', 'code.ts');
    await until(() => run((n) => document.querySelector('.worktree-source')?.textContent.includes(`worker ${n}`), name), 'correct registered bytes');
    await button('.worktree-inspection', 'Worktree diff');
    await until(() => run((n) => { const text = document.querySelector('.worktree-diff')?.textContent ?? ''; return text.includes('-export const name = "master"') && text.includes(`+export const name = "worker ${n}"`) && text.includes('+export const local = true;'); }, name), 'committed and dirty master diff');
    await fs.writeFile(path.join(evidence, `worker-${name}.png`), await win.capturePage().then((image) => image.toPNG()));
    await button('.agent-worktree-heading', 'Return to workspace');
    assert.deepEqual(await source(), retained);
  }
  assert.deepEqual(await run(() => [...document.querySelectorAll('.graphs-grid .react-flow__viewport')].map((e) => e.style.transform)), cameras);
  assert(await run(() => document.querySelector('.source-surface .cm-content') === window.proofEditor && window.proofGraphs.every((el) => el.isConnected)));
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  await fs.writeFile(path.join(evidence, 'proof.json'), JSON.stringify({ ok: true, milliseconds: Date.now() - start, controlledWrapper: true, actualPackagedCore: true, realLinkedWorktrees: 2, masterCommittedAndDirty: true, originalEditorAndCursorRetained: true, camerasRetained: true, errors, writes }, null, 2));
  await until(() => fs.access(path.join(evidence, 'close-now')).then(() => true, () => false), 'screenshot complete');
  // Clear only this disposable test buffer's unload veto; no source-save request.
  await run(() => { window.onbeforeunload = null; });
  win.destroy(); app.quit();
}
main().catch(async (error) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) await fs.writeFile(path.join(evidence, 'failure.png'), await win.capturePage().then((image) => image.toPNG())).catch(() => {});
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ message: error.stack, errors, writes }));
  await delay(500); app.exit(1);
});
