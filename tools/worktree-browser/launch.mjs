import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveElectronRuntimeArguments } from '../electron-runtime.mjs';
const scripts = dirname(fileURLToPath(import.meta.url));
const evidence = process.env.SWARM_ARTIFACT_DIR;
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const source = process.env.BUILD_WORKSPACE_DIRECTORY;
const built = runfiles ? join(runfiles, '_main') : join(source, 'bazel-bin');
const scratch = await mkdtemp(join(process.env.SWARM_X11_OWNERSHIP_DIR, 'worktrees-'));
const root = join(scratch, 'master'), first = join(scratch, 'worker-a'), second = join(scratch, 'worker-b');
const packaged = join(scratch, 'package'), profile = join(scratch, 'profile');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Worktree proof', GIT_AUTHOR_EMAIL: 'proof@example.invalid', GIT_COMMITTER_NAME: 'Worktree proof', GIT_COMMITTER_EMAIL: 'proof@example.invalid' });
const git = (cwd, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], { cwd, env, timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] });
let desktop, server;
const stop = () => desktop?.kill('SIGTERM');
try {
  for (const path of [root, packaged, profile]) await mkdir(path);
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'README.md'), '# Original operator source\n');
  await writeFile(join(root, 'src/code.ts'), 'export const name = "master";\nexport const local = false;\n');
  git(root, 'init', '-b', 'master'); git(root, 'add', '.'); git(root, 'commit', '-m', 'Owned initial source');
  git(root, 'worktree', 'add', '-b', 'worker-a', first); git(root, 'worktree', 'add', '-b', 'worker-b', second);
  for (const [path, name] of [[first, 'worker A'], [second, 'worker B']]) {
    await writeFile(join(path, 'src/code.ts'), `export const name = "${name}";\nexport const local = false;\n`);
    git(path, 'add', '.'); git(path, 'commit', '-m', 'Agent committed change');
    await writeFile(join(path, 'src/code.ts'), `export const name = "${name}";\nexport const local = true;\n`);
    await writeFile(join(path, 'notes.txt'), `Untracked notes for ${name}\n`);
  }
  const registry = join(scratch, 'registry.json');
  await writeFile(registry, JSON.stringify({ version: 1, sessions: [first, second].map((contextRoot, i) => ({
    id: `10000000-0000-4000-8000-00000000000${i + 1}`, label: `Owned worker ${i ? 'B' : 'A'}`, contextRoot, rollout: join(scratch, `absent-${i}.jsonl`),
  })) }), { mode: 0o600 });
  // This proof registers owned worktrees only, not fabricated agent conversations.
  execFileSync('tar', ['-xzf', join(built, 'swarm-ide-foundation.tar.gz'), '-C', packaged]);
  await copyFile(join(built, 'tools/worktree-browser/browser.js'), join(packaged, 'renderer/browser.js'));
  await copyFile(join(built, 'tools/worktree-browser/browser.css'), join(packaged, 'renderer/browser.css'));
  await writeFile(join(packaged, 'renderer/index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="./browser.css"></head><body><div id="root"></div><script type="module" src="./browser.js"></script></body></html>');
  const paths = [root, first, second];
  const before = paths.map((cwd) => ({ index: git(cwd, 'rev-parse', '--path-format=absolute', '--git-path', 'index').toString().trim(), source: join(cwd, 'src/code.ts') }));
  const bytes = await Promise.all(before.map(async (p) => [await readFile(p.index), await readFile(p.source)]));
  server = createServer((_req, response) => { response.end('owned worktree browser'); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(process.env.SWARM_VIRTUAL_DESKTOP_PORT), '127.0.0.1', resolve); });
  const runtime = { ...env, SWARM_EXTERNAL_AGENTS_REGISTRY: registry, SWARM_WORKTREE_PACKAGE: packaged, SWARM_WORKTREE_PROFILE: profile, XDG_CONFIG_HOME: profile };
  for (const key of ['SWARM_RENDERER_URL', 'SWARM_DEV_CONTROL', 'SWARM_WORKSPACE_ROOT', 'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY']) delete runtime[key];
  desktop = spawn(process.env.SWARM_ELECTRON_BIN, [...resolveElectronRuntimeArguments(), join(scripts, 'acceptance.cjs'), `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: root, env: runtime, stdio: 'inherit' });
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  const code = await new Promise((resolve) => desktop.once('exit', (status) => resolve(status ?? 1)));
  for (const [i, p] of before.entries()) {
    if (!(await readFile(p.index)).equals(bytes[i][0]) || !(await readFile(p.source)).equals(bytes[i][1])) throw new Error('Worktree source or index changed during read-only proof');
  }
  await writeFile(join(evidence, 'readonly.json'), JSON.stringify({ originalAndTwoWorktreesUnchanged: true }));
  process.exitCode = code;
} catch (error) {
  await writeFile(join(evidence, 'failure.json'), JSON.stringify({ stage: 'launcher', message: error.stack })); process.exitCode = 1;
} finally {
  process.off('SIGTERM', stop); process.off('SIGINT', stop);
  if (desktop && desktop.exitCode === null) desktop.kill('SIGTERM');
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(scratch, { recursive: true, force: true });
}
