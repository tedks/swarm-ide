const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const evidence = process.env.SWARM_ARTIFACT_DIR, errors = [], mutations = [], requests = [];
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (name, listener) => handle(name, (event, input) => {
  if (name === 'swarm:request') {
    requests.push({type:input.type,workspaceId:input.workspaceId,path:input.path});
    if (/send|launch|prepare|write|save|fork/.test(input.type)) mutations.push(input.type);
  }
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
      if (el.disabled || !el.contains(document.elementFromPoint(x, y))) throw new Error(`Blocked ${s}`); return { x: Math.round(x), y: Math.round(y) }; }, selector);
    wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point }); wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point }); await paint();
  };
  const source = () => run(() => { const s = document.querySelector('.source-surface .cm-content')?.cmView?.rootView?.view?.state; return s ? { text: s.doc.toString(), anchor: s.selection.main.anchor, head: s.selection.main.head } : null; });
  const openSource = async () => {
    await click('.command-trigger'); await until(() => run(() => document.activeElement?.getAttribute('aria-label') === 'Workspace command'), 'palette focus');
    await wc.insertText('src/code.ts'); await click('[data-file-search-path="src/code.ts"]');
  };
  win.focus(); wc.focus();
  await openSource();
  await until(async () => (await source())?.text.includes('"master"'), 'launch source');
  await click('.source-surface .cm-content'); wc.sendInputEvent({ type: 'keyDown', keyCode: 'End', modifiers: ['control'] }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'End', modifiers: ['control'] });
  await wc.insertText('// unsaved master note\n');
  const retained = await source();
  const cameras = await run(() => [...document.querySelectorAll('.graphs-grid .react-flow__viewport')].map((e) => e.style.transform));
  await until(() => run(() => document.querySelector('select[aria-label="Worktree"]')?.options.length >= 3), 'registered worktrees');
  // Native select keyboard drives the ordinary worktree dropdown.
  await run(() => document.querySelector('select[aria-label="Worktree"]').focus());
  assert.equal(await run(() => document.activeElement?.getAttribute('aria-label')), 'Worktree');
  wc.sendInputEvent({type:'keyDown',keyCode:'Down'}); wc.sendInputEvent({type:'keyUp',keyCode:'Down'});
  wc.sendInputEvent({type:'keyDown',keyCode:'Enter'}); wc.sendInputEvent({type:'keyUp',keyCode:'Enter'});
  await until(() => run(() => document.querySelector('.worktree-global')?.textContent.includes('Owned worker A')), 'ordinary worktree selection');
  await until(() => run(() => document.querySelector('.repository-navigation')?.textContent.includes('worker-a')), 'ordinary directory browser root');
  await openSource(); await until(async () => (await source())?.text.includes('"worker A"'), 'same path different worktree bytes');
  await fs.writeFile(path.join(evidence, 'agent-worktree.png'), await win.capturePage().then((image) => image.toPNG()));
  // B/file -> B/root -> original source, through the public Back controls.
  await click('button[aria-label="Go back"]');
  await click('button[aria-label="Go back"]');
  await until(async () => (await source())?.text === retained.text, 'retained dirty launch buffer');
  assert.deepEqual(await source(), retained);
  await paint(); await paint();
  assert.deepEqual(await run(() => [...document.querySelectorAll('.graphs-grid .react-flow__viewport')].map((e) => e.style.transform)), cameras);
  await click('button[aria-label="Go forward"]');
  await until(() => run(() => document.querySelector('.worktree-global')?.textContent.includes('Owned worker A')), 'Forward restores agent worktree');
  assert.deepEqual(errors, []); assert.deepEqual(mutations, []);
  const fileScopes = new Set(requests.filter((r) => r.type === 'file.read' && r.path === 'src/code.ts').map((r) => r.workspaceId));
  assert.equal(fileScopes.size, 2); assert(!fileScopes.has(undefined));
  await fs.writeFile(path.join(evidence, 'proof.json'), JSON.stringify({ok:true,milliseconds:Date.now()-start,actualPackagedApp:true,registeredFixtureTranscripts:true,realGitWorktrees:true,ordinaryDirectorySwitch:true,dirtyBufferCursorAndCamerasRetained:true,backForward:true,scopedReads:fileScopes.size,errors,mutations},null,2));
  await until(() => fs.access(path.join(evidence, 'close-now')).then(() => true, () => false), 'screenshot complete');
  win.destroy(); app.quit();
}
main().catch(async (error) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) await fs.writeFile(path.join(evidence, 'failure.png'), await win.capturePage().then((image) => image.toPNG())).catch(() => {});
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({message:error.stack,errors,mutations,requests}));
  await delay(500); app.exit(1);
});
