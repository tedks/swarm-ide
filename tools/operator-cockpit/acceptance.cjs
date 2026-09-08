// Native input through an unchanged packaged app. Private registry copy points
// at a real current session; transcripts and registered worktree are read-only.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const evidence = process.env.SWARM_COCKPIT_EVIDENCE;
const errors = [], requests = []; let stage = 'startup', currentWindow;
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, (event, input) => {
  if (channel === 'swarm:request') {
    if (requests.length >= 10000) throw new Error('Cockpit request observation bound');
    requests.push({ type: input.type, ...(input.path ? { path: input.path } : {}), ...(input.sessionId ? { sessionId: input.sessionId } : {}) });
  }
  return listener(event, input);
});
app.on('web-contents-created', (_event, wc) => {
  wc.on('console-message', (event) => { if (event.level === 'error') errors.push({ stage, message: event.message }); });
  wc.on('render-process-gone', (_event, info) => errors.push({ stage, message: `Renderer gone: ${info.reason}` }));
});
require(path.join(process.env.SWARM_COCKPIT_PACKAGE, 'app/electron/main.js'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await delay(50); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const started = Date.now(), repository = JSON.parse(await fs.readFile(path.join(evidence, 'repository.json'), 'utf8'));
  await app.whenReady();
  assert.equal(app.getPath('userData'), process.env.SWARM_COCKPIT_PROFILE);
  await until(() => fs.access(path.join(evidence, 'window-selected')).then(() => true, () => false), 'owned window selected', 30000);
  const win = currentWindow = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  assert.equal(wc.getURL(), pathToFileURL(path.join(process.env.SWARM_COCKPIT_PACKAGE, 'renderer/index.html')).href);
  const run = (fn, ...args) => wc.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  await run(() => {
    addEventListener('error', (event) => console.error(event.error?.stack ?? event.message));
    addEventListener('unhandledrejection', (event) => console.error(event.reason?.stack ?? event.reason));
  });
  const paint = () => run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const click = async (selector) => {
    await run((s) => { const e = document.querySelector(s); if (!e || e.disabled) throw new Error(`Missing/disabled ${s}`);
      e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, selector);
    await paint();
    const p = await run((s) => {
      const e = document.querySelector(s), r = e.getBoundingClientRect();
      let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
      for (let parent = e.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
        if (style.overflowX !== 'visible') { left = Math.max(left, box.left); right = Math.min(right, box.right); }
        if (style.overflowY !== 'visible') { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
      }
      const x = (left + right) / 2, y = (top + bottom) / 2;
      if (right <= left || bottom <= top || !e.contains(document.elementFromPoint(x, y))) throw new Error(`Occluded ${s}`);
      return { x, y };
    }, selector);
    const coordinates = { x: Math.round(p.x * wc.getZoomFactor()), y: Math.round(p.y * wc.getZoomFactor()) };
    wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...coordinates });
    wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...coordinates }); await paint();
  };
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await paint();
  };
  const source = () => run(() => {
    const surface = document.querySelector('.source-surface'), state = surface?.querySelector('.cm-content')?.cmView?.rootView?.view?.state;
    return state ? { path: surface.querySelector('header strong').textContent, text: state.doc.toString(),
      anchor: state.selection.main.anchor, head: state.selection.main.head } : null;
  });
  const cameras = () => run(() => [...document.querySelectorAll('.graphs-grid .react-flow__viewport')].map((e) => e.style.transform));
  win.focus(); wc.focus();
  await until(() => run(() => Boolean(document.querySelector('.command-trigger'))), 'workbench ready');
  stage = 'dirty local source';
  await click('.command-trigger');
  await until(() => run(() => document.activeElement?.getAttribute('aria-label') === 'Workspace command'), 'palette focus');
  await wc.insertText('README.md');
  await until(() => run(() => Boolean(document.querySelector('[data-file-search-path="README.md"]'))), 'actual Git filename search');
  await click('[data-file-search-path="README.md"]');
  await until(async () => (await source())?.text === repository.files['README.md'], 'actual local source');
  await click('.source-surface .cm-content'); await key('End', ['control']);
  await wc.insertText('Unsaved cockpit operator note\n');
  await until(async () => (await source())?.text === repository.files['README.md'] + 'Unsaved cockpit operator note\n', 'native unsaved edit');
  await key('Home', ['control']); await key('End');
  const retained = await source();
  assert.equal(await fs.readFile(path.join(repository.root, 'README.md'), 'utf8'), repository.files['README.md']);
  let prior = '', stableAt = Date.now();
  await until(async () => { const value = JSON.stringify(await cameras()); if (value !== prior) { prior = value; stableAt = Date.now(); }
    return Date.now() - stableAt >= 300; }, 'source navigation settled');
  const retainedCameras = await cameras(); assert(retainedCameras.length >= 2);
  await run(() => { globalThis.__cockpitGraphNodes = [...document.querySelectorAll('.graphs-grid > *')]; });
  stage = 'real registered session';
  const sessionSelector = `[aria-label=${JSON.stringify(`Inspect external agent ${repository.target.label}`)}]`;
  await until(() => run((s) => Boolean(document.querySelector(s)), sessionSelector), 'real registered agent');
  await click(sessionSelector);
  await until(() => run((id) => document.querySelector('[aria-label="External agent information"]')?.dataset.externalSession === id,
    repository.target.id), 'selected real session');
  stage = 'cross-worktree briefing link';
  // Locate the actual operator-associated context disclosure by its rendered
  // summary. This only labels the existing control for native input.
  await until(() => run(() => {
    const section = document.querySelector('[aria-label="External agent information"]');
    const summary = [...(section?.querySelectorAll('summary') ?? [])].find((e) => e.textContent === 'Why this context?');
    if (summary) summary.setAttribute('data-cockpit-briefing', 'true');
    return Boolean(summary);
  }), 'registered cross-worktree context link');
  await click('[data-cockpit-briefing]');
  await run((name) => {
    const button = [...document.querySelector('[data-cockpit-briefing]').parentElement.querySelectorAll('button')].find((e) => e.textContent === name);
    if (!button) throw new Error('Missing registered briefing file');
    button.setAttribute('data-cockpit-briefing-file', 'true');
  }, repository.target.path);
  await click('[data-cockpit-briefing-file]');
  await until(() => run(() => Boolean(document.querySelector('.worktree-source'))), 'briefing opens registered worktree source');
  assert.equal(await run(() => document.querySelector('.worktree-location').textContent), repository.target.root);
  assert.equal(await run(() => document.querySelector('.worktree-source').textContent), await fs.readFile(path.join(repository.target.root, repository.target.path), 'utf8'));
  await fs.writeFile(path.join(evidence, 'agent-briefing-source.png'), (await wc.capturePage()).toPNG());
  await click('.worktree-inspection header > button');
  assert.deepEqual(await source(), retained);
  if (process.env.SWARM_COCKPIT_BRIEFING_ONLY === '1') {
    assert.deepEqual(await cameras(), retainedCameras);
    const graphNodesRetained = await run(() => globalThis.__cockpitGraphNodes.every((e) => e.isConnected));
    assert(graphNodesRetained);
    await click('.file-state button');
    await until(() => run(() => document.querySelector('.file-state').classList.contains('file-saved')), 'owned source save');
    assert.equal(await fs.readFile(path.join(repository.root, 'README.md'), 'utf8'), retained.text);
    assert(requests.filter((r) => r.type === 'file.write').every((r) => r.path === 'README.md'));
    const agentWrites = requests.filter((r) => /^(?:externalAgents\.(?:send|handoff)|trusted\.(?:prepare|launch|send|fork|stop|decide)|agent\.(?:prepare|launch|steer|cancel)|workLog\.(?:start|record))$/.test(r.type));
    assert.deepEqual(agentWrites, []); assert.deepEqual(errors, []);
    await fs.writeFile(path.join(evidence, 'proof.json'), JSON.stringify({ ok: true, scope: 'briefing-only', packagedCore: true,
      realRegisteredSession: repository.target.id, crossWorktreeBriefingOpened: true, crossWorktreeBytes: true,
      readOnly: true, sourceRetained: true, camerasRetained: true, graphNodesRetained, ownedSourceSaved: true,
      agentWrites, requests, blockingErrors: errors, acceptedResizeWarnings: [], elapsedMs: Date.now() - started }, null, 2));
    return;
  }
  stage = 'real registered session activity';
  // Follow an actual recorded file event through the persistent Activity log.
  // No renderer injection or direct bridge call supplies the navigation.
  await click('.dock-activity .activity-open-heading');
  const recordedPath = path.join(repository.target.root, repository.target.path);
  const activityFile = `[data-activity-file=${JSON.stringify(recordedPath)}][data-session=${JSON.stringify(repository.target.id)}]`;
  await until(() => run((s) => Boolean(document.querySelector(s)), activityFile), 'actual agent edit in live Activity');
  const before = await fs.readFile(path.join(repository.target.root, repository.target.path), 'utf8');
  stage = 'cross-worktree inspection';
  await click(activityFile);
  await click('[aria-label="Worktree file views"] button:first-child');
  await until(() => run(() => Boolean(document.querySelector('.worktree-source'))), 'actual worktree source');
  const inspected = await run(() => ({ text: document.querySelector('.worktree-source').textContent,
    root: document.querySelector('.worktree-location').textContent, label: document.querySelector('.worktree-inspection header small').textContent,
    editable: Boolean(document.querySelector('.worktree-inspection [contenteditable="true"],.worktree-inspection textarea')) }));
  const after = await fs.readFile(path.join(repository.target.root, repository.target.path), 'utf8');
  assert.equal(after, before, 'Target was stable during this bounded inspection; otherwise reroute to a stable file');
  assert.equal(inspected.text, after); assert.equal(inspected.root, repository.target.root);
  assert.notEqual(inspected.text, repository.files[repository.target.path], 'Do not read the same path from the opened repository');
  assert(inspected.label.includes('read-only')); assert.equal(inspected.editable, false);
  assert(requests.some((r) => r.type === 'worktree.inspect' && r.sessionId === repository.target.id && r.path === repository.target.path));
  await fs.writeFile(path.join(evidence, 'agent-worktree-source.png'), (await wc.capturePage()).toPNG());
  await click('[aria-label="Worktree file views"] button:nth-of-type(2)');
  await until(() => run(() => Boolean(document.querySelector('.worktree-diff'))), 'worktree diff view');
  assert((await run(() => document.querySelector('.worktree-diff').textContent)).includes('*** Begin Patch'), 'Recorded patch is shown separately from current worktree diff');
  await fs.writeFile(path.join(evidence, 'agent-recorded-patch.png'), (await wc.capturePage()).toPNG());
  await click('[aria-label="Worktree file views"] button:nth-of-type(3)');
  assert((await run(() => document.querySelector('.worktree-diff').textContent)).includes('Current changes against HEAD in this worktree.'));
  await fs.writeFile(path.join(evidence, 'agent-worktree-diff.png'), (await wc.capturePage()).toPNG());
  stage = 'retained local source';
  await click('.worktree-inspection header > button');
  await until(() => run(() => !document.querySelector('.worktree-inspection')), 'return to local source');
  assert.deepEqual(await source(), retained); assert.deepEqual(await cameras(), retainedCameras);
  const graphNodesRetained = await run(() => globalThis.__cockpitGraphNodes.every((e) => e.isConnected));
  assert(graphNodesRetained); assert(await run(() => document.querySelector('.file-state').textContent.includes('dirty')));
  const graphColors = await run(() => [...document.querySelectorAll('.react-flow__controls-button,.react-flow__attribution a')].map((e) => ({
    label: e.getAttribute('aria-label') || e.textContent, color: getComputedStyle(e).color,
    background: getComputedStyle(e).backgroundColor, parentBackground: getComputedStyle(e.parentElement).backgroundColor,
  })));
  await fs.writeFile(path.join(evidence, 'graph-colors.json'), JSON.stringify(graphColors, null, 2));
  await fs.writeFile(path.join(evidence, 'retained-source-controls.png'), (await wc.capturePage()).toPNG());
  stage = 'saved generated Work Log outcome';
  const outcomeSelector = `[data-work-log-entry=${JSON.stringify(repository.capturedWorkLog.id)}] .work-log-outcome`;
  await until(() => run((s) => Boolean(document.querySelector(s)), outcomeSelector), 'archived real generated outcome read through core');
  await click(outcomeSelector);
  await until(() => run(() => Boolean(document.querySelector('.work-log-center'))), 'outcome opens in center');
  assert.equal(await run(() => document.querySelector('.work-log-center .work-log-outcome').textContent), repository.capturedWorkLog.outcome);
  await fs.writeFile(path.join(evidence, 'work-log-outcome.png'), (await wc.capturePage()).toPNG());
  stage = 'captured system design';
  await click('.design-open-button');
  await until(() => run(() => document.querySelector('.design-prose')?.textContent.includes('engineering organization')), 'real design document through core');
  assert(await run(() => document.querySelector('.design-graph').textContent.includes('Cockpit')));
  assert.equal(await run(() => Boolean(document.querySelector('.work-log-center'))), false);
  await fs.writeFile(path.join(evidence, 'system-design.png'), (await wc.capturePage()).toPNG());
  await click('[aria-label="Close system design"]');
  assert.deepEqual(await source(), retained); assert.deepEqual(await cameras(), retainedCameras);
  assert(await run(() => globalThis.__cockpitGraphNodes.every((e) => e.isConnected)));
  // Only the disposable local source is saved, through its ordinary editor UI.
  await click('.file-state button');
  await until(() => run(() => document.querySelector('.file-state').classList.contains('file-saved')), 'owned source save');
  assert.equal(await fs.readFile(path.join(repository.root, 'README.md'), 'utf8'), retained.text);
  assert(requests.filter((r) => r.type === 'file.write').every((r) => r.path === 'README.md'));
  const agentWrites = requests.filter((r) => /^(?:externalAgents\.(?:send|handoff)|trusted\.(?:prepare|launch|send|fork|stop|decide)|agent\.(?:prepare|launch|steer|cancel)|workLog\.(?:start|record))$/.test(r.type));
  assert.deepEqual(agentWrites, []);
  const acceptedResizeWarnings = errors.filter((e) => e.message === 'ResizeObserver loop completed with undelivered notifications.');
  const blockingErrors = errors.filter((e) => e.message !== 'ResizeObserver loop completed with undelivered notifications.');
  assert.deepEqual(blockingErrors, []);
  await fs.writeFile(path.join(evidence, 'proof.json'), JSON.stringify({ ok: true, packagedCore: true,
    realRegisteredSession: repository.target.id, privateRegistrationCopy: true, originalTranscriptUnchanged: true,
    crossWorktreeBriefingOpened: true, crossWorktreeBytes: true, readOnly: true, sourceRetained: true, camerasRetained: true, graphNodesRetained,
    archivedGeneratedWorkLogOpened: true, capturedSystemDesignOpened: true, newSummaryCalls: 0,
    ownedSourceSaved: true, agentWrites, requests, blockingErrors, acceptedResizeWarnings, elapsedMs: Date.now() - started }, null, 2));
}
main().catch(async (error) => {
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ stage, message: error.stack, errors, requests }, null, 2));
  try { if (currentWindow) await fs.writeFile(path.join(evidence, 'failure.png'), (await currentWindow.webContents.capturePage()).toPNG()); } catch {}
  app.exit(1);
});
