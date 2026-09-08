import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, copyFile, chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveElectronRuntimeArguments } from '../electron-runtime.mjs';
import { resolveOwnedVirtualPort } from '../task-integration/owned-port.mjs';
const scripts = dirname(fileURLToPath(import.meta.url));
const port = await resolveOwnedVirtualPort();
const evidence = await realpath(process.env.SWARM_TRUSTED_EVIDENCE);
const electron = process.env.SWARM_ELECTRON_BIN;
if (!electron || !isAbsolute(electron)) throw new Error('Nix Electron required');
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const archive = runfiles ? join(runfiles, '_main/swarm-ide-foundation.tar.gz') : join(process.cwd(), 'bazel-bin/swarm-ide-foundation.tar.gz');
await access(archive);
const scratch = await mkdtemp(join(process.env.SWARM_X11_OWNERSHIP_DIR, 'trusted-package-'));
let server, desktop, killTimer;
const handlers = new Map();
try {
  const extracted = join(scratch, 'app'), profile = join(scratch, 'profile'), root = join(scratch, 'repository');
  await mkdir(extracted); await mkdir(profile, { mode: 0o700 }); await mkdir(root);
  execFileSync('tar', ['-xzf', archive, '-C', extracted], { timeout: 30000 });
  const sourceText = 'export const proof = "disposable public fixture";\n';
  await writeFile(join(root, 'proof.ts'), sourceText);
  for (const args of [['init', '-q'], ['add', 'proof.ts'], ['-c', 'user.name=Proof', '-c', 'user.email=proof@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Disposable trusted-local proof']])
    execFileSync('git', args, { cwd: root, timeout: 10000 });
  const stateHome = join(scratch, 'state'); await mkdir(stateHome, { mode: 0o700 });
  const fixture = { root, sourceText, stateHome, evidence };

  await writeFile(join(root, '.proof-fixture.json'), JSON.stringify(fixture));
  await writeFile(join(evidence, 'fixture.json'), JSON.stringify(fixture));
  const fake = join(scratch, 'fake-codex.cjs'); await copyFile(join(scripts, 'joined-fake-codex.cjs'), fake); await chmod(fake, 0o700);
  server = createServer((_request, response) => { response.writeHead(200); response.end('owned trusted-local proof'); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const env = { ...process.env, NODE_PATH: '', XDG_STATE_HOME: stateHome, SWARM_CODEX_BIN: fake, SWARM_TRUSTED_PACKAGE: extracted, SWARM_TRUSTED_PROFILE: profile };
  for (const name of ['SWARM_RENDERER_URL', 'SWARM_DEV_CONTROL', 'SWARM_WORKSPACE_ROOT', 'SWARM_AGENT_STORE_ROOT', 'SWARM_EXTERNAL_AGENTS_REGISTRY', 'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE']) delete env[name];
  desktop = spawn(electron, [...resolveElectronRuntimeArguments(), join(scripts, 'joined-acceptance.cjs'), `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: root, env, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    const handler = () => { desktop.kill('SIGTERM'); killTimer ??= setTimeout(() => desktop.kill('SIGKILL'), 2000); };
    handlers.set(signal, handler); process.on(signal, handler);
  }
  process.exitCode = await new Promise((resolve, reject) => { desktop.once('error', reject); desktop.once('exit', (code) => resolve(code ?? 1)); });
} finally {
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  clearTimeout(killTimer);
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(scratch, { recursive: true, force: true });
}

