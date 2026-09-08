#!/usr/bin/env bash
set -euo pipefail
cockpit_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies source workspace}"
exec node --input-type=module - "$cockpit_scripts" <<'JS'
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const scripts = process.argv[2];
const { resolveOwnedVirtualPort } = await import(pathToFileURL(join(scripts, '../task-integration/owned-port.mjs')));
const { resolveElectronRuntimeArguments } = await import(pathToFileURL(join(scripts, '../electron-runtime.mjs')));
const port = await resolveOwnedVirtualPort();
const evidence = await realpath(process.env.SWARM_COCKPIT_EVIDENCE);
const electron = process.env.SWARM_ELECTRON_BIN;
if (!electron || !isAbsolute(electron)) throw new Error('Pinned Nix Electron required');
const tabsOnly = process.env.SWARM_COCKPIT_TABS_ONLY === '1';
let registered, targetRoot;
const targetPath = 'app/renderer/App.tsx';
if (!tabsOnly) {
const registryPath = process.env.SWARM_COCKPIT_REGISTRY;
if (!registryPath || !isAbsolute(registryPath) || await realpath(registryPath) !== registryPath) throw new Error('Canonical private registry required');
const registryStat = await lstat(registryPath);
if (!registryStat.isFile() || registryStat.uid !== process.getuid() || registryStat.mode & 0o077 || registryStat.size > 65536)
  throw new Error('Invalid private registry');
const originalRegistry = JSON.parse(await readFile(registryPath, 'utf8'));
registered = originalRegistry.sessions.find((session) => session.id === process.env.SWARM_COCKPIT_SESSION);
if (!registered || registered.evidence !== 'local' || !isAbsolute(registered.contextRoot ?? '') || !isAbsolute(registered.rollout ?? ''))
  throw new Error('A real registered local session/worktree is required');
targetRoot = await realpath(registered.contextRoot);
if (targetRoot !== registered.contextRoot) throw new Error('Registered worktree must be canonical');
await access(join(targetRoot, targetPath)); await access(registered.rollout);
}
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const archive = runfiles ? join(runfiles, '_main/swarm-ide-foundation.tar.gz') : join(process.cwd(), 'bazel-bin/swarm-ide-foundation.tar.gz');
await access(archive);
const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
const scratch = await mkdtemp(join(process.env.SWARM_X11_OWNERSHIP_DIR, 'cockpit-'));
const root = join(scratch, 'local-repository'), packaged = join(scratch, 'app'), profile = join(scratch, 'profile');
let server, desktop, killTimer;
const handlers = new Map();
try {
  for (const dir of [root, packaged, profile]) await mkdir(dir, { mode: 0o700 });
  await mkdir(join(root, 'app/renderer'), { recursive: true });
  const files = { 'README.md': '# Owned local editor\nKeep this buffer intact while inspecting another worktree.\n',
    [targetPath]: '// Decoy in opened repository. This is not the agent worktree.\n' };
  let workLog;
  const tabFiles = [];
  if (tabsOnly) {
    files['README.md'] += Array.from({ length: 80 }, (_, index) => `Line ${index + 1}: retained local source ${'wide source content '.repeat(15)}\n`).join('');
    for (let index = 1; index <= 10; index++) {
      const name = `operator-overflow-source-${String(index).padStart(2, '0')}.ts`;
      tabFiles.push(name); files[name] = `// Disposable overflow source ${index}\nexport const index = ${index};\n`;
    }
  } else {
  // Captured real design documents and K7's previously generated summary are
  // ordinary on-disk inputs, not new inference or injected renderer rows.
  const designBytes = await readFile(join(process.cwd(), '.swarm/plans.json'), 'utf8');
  const design = JSON.parse(designBytes);
  files['.swarm/plans.json'] = designBytes;
  for (const doc of new Set(design.nodes.flatMap((node) => node.docs))) {
    if (!doc.startsWith('docs/design/')) continue;
    if (!/^docs\/design\/[a-z-]+\.md$/.test(doc)) throw new Error('Unexpected design document path');
    files[doc] = await readFile(join(process.cwd(), doc), 'utf8');
  }
  const archivePath = process.env.SWARM_COCKPIT_WORK_LOG_ARCHIVE;
  if (!archivePath || !isAbsolute(archivePath)) throw new Error('Supply the archived generated Work Log');
  const workLogBytes = await readFile(archivePath, 'utf8'); workLog = JSON.parse(workLogBytes);
  if (workLog.version !== 1 || !workLog.entries?.[0]?.outcome) throw new Error('Invalid archived Work Log');
  files['.swarm/work-log.json'] = workLogBytes;
  }
  for (const name of Object.keys(files)) await mkdir(dirname(join(root, name)), { recursive: true });
  for (const [name, content] of Object.entries(files)) await writeFile(join(root, name), content);
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { ...cleanEnvironment, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: 'Cockpit proof', GIT_AUTHOR_EMAIL: 'cockpit@example.invalid', GIT_COMMITTER_NAME: 'Cockpit proof',
      GIT_COMMITTER_EMAIL: 'cockpit@example.invalid', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' },
  });
  git('init', '-b', 'cockpit-proof'); git('add', '--', ...Object.keys(files)); git('commit', '-m', 'Owned local editor proof');
  const privateRegistry = join(scratch, 'registry.json');
  // Only operator briefing metadata is added. Real rollout and worktree remain unchanged.
  await writeFile(privateRegistry, JSON.stringify({ version: 1, sessions: tabsOnly ? [] : [{ ...registered, contextPaths: [targetPath] }] }), { mode: 0o600 });
  await writeFile(join(evidence, 'repository.json'), JSON.stringify({ root, files,
    ...(tabsOnly ? { tabsOnly: true, tabFiles } : { capturedWorkLog: { id: workLog.entries[0].id, outcome: workLog.entries[0].outcome }, capturedDesign: true,
      target: { id: registered.id, label: registered.label, root: targetRoot, path: targetPath } }) }, null, 2));
  execFileSync('tar', ['-xzf', archive, '-C', packaged], { timeout: 30000 });
  server = createServer((_req, res) => { res.writeHead(200); res.end('owned cockpit proof'); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const environment = { ...cleanEnvironment, GH_CONFIG_DIR: process.env.GH_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(process.env.HOME, '.config'), 'gh'),
    XDG_CONFIG_HOME: profile, NODE_PATH: '', SWARM_EXTERNAL_AGENTS_REGISTRY: privateRegistry,
    SWARM_COCKPIT_PACKAGE: packaged, SWARM_COCKPIT_PROFILE: profile };
  for (const name of ['SWARM_RENDERER_URL', 'SWARM_DEV_CONTROL', 'SWARM_WORKSPACE_ROOT', 'SWARM_AGENT_STORE_ROOT',
    'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) delete environment[name];
  desktop = spawn(electron, [...resolveElectronRuntimeArguments(), join(scripts, 'acceptance.cjs'),
    `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: root, env: environment, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    const handler = () => { desktop.kill('SIGTERM'); killTimer ??= setTimeout(() => desktop.kill('SIGKILL'), 2000); };
    handlers.set(signal, handler); process.on(signal, handler);
  }
  process.exitCode = await new Promise((resolve, reject) => { desktop.once('error', reject); desktop.once('exit', (code) => resolve(code ?? 1)); });
} catch (error) {
  await writeFile(join(evidence, 'failure.json'), JSON.stringify({ stage: 'launcher', message: error.stack })); process.exitCode = 1;
} finally {
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  clearTimeout(killTimer);
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(scratch, { recursive: true, force: true });
}
JS
