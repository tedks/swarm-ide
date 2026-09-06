import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { lstat, readdir, readlink } from 'node:fs/promises';

export const LIMIT = 256 * 1024;
export const INSTALLATION_SEED = '00000000-0000-4000-8000-000000000001\n';
export const ENV = Object.freeze({ HOME: '/home/probe', CODEX_HOME: '/home/probe/.codex',
  XDG_CONFIG_HOME: '/home/probe/.config', XDG_DATA_HOME: '/state/data',
  XDG_CACHE_HOME: '/state/cache', XDG_RUNTIME_DIR: '/state/run',
  TMPDIR: '/tmp', LANG: 'C.UTF-8', PWD: '/work', SHELL: '/runtime/bin/bash', PATH: '/runtime/bin:/package/codex-path' });
export const REQUIRED = Object.freeze(['hooks', 'plugin_hooks', 'plugins', 'recommended_plugins',
  'remote_plugin', 'plugin_sharing', 'executor_capability_discovery', 'skip_host_skill_discovery',
  'apps', 'enable_mcp_apps', 'mcp_2026_07_28', 'mcp_oauth_refresh_coordination', 'apps_mcp_path_override',
  'tool_search', 'tool_search_always_defer_mcp_tools', 'deferred_tool_world_state',
  'non_prefixed_mcp_tool_names', 'unavailable_dummy_tools', 'tool_suggest', 'tool_call_mcp_elicitation',
  'auth_elicitation', 'multi_agent', 'multi_agent_v2', 'multi_agent_mode', 'enable_fanout',
  'send_async_message', 'remote_control', 'remote_models', 'shell_tool', 'unified_exec',
  'shell_snapshot', 'shell_snapshot_v2', 'shell_zsh_fork', 'unified_exec_zsh_fork', 'deferred_executor',
  'skill_mcp_dependency_install', 'skill_search', 'skill_env_var_dependency_prompt',
  'memories', 'external_agent_memory_import', 'chronicle']);

export function validatePackageManifest(manifest) {
  if (!manifest || manifest.version !== '0.153.4' || manifest.layoutVersion !== 1 ||
    manifest.target !== 'x86_64-unknown-linux-musl' || manifest.variant !== 'codex' ||
    manifest.entrypoint !== 'bin/codex' || manifest.resourcesDir !== 'codex-resources' || manifest.pathDir !== 'codex-path') {
    throw new Error('UNSUPPORTED_PACKAGE');
  }
}

export async function digestFile(path) {
  const hash = createHash('sha256');
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > 512 * 1024 * 1024) throw new Error('UNSUPPORTED_INPUT_FILE');
  for await (const chunk of createReadStream(path, { flags: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK })) hash.update(chunk);
  return hash.digest('hex');
}

export function buildArgs(runtime, closure, fixture, command) {
  if (!/^\/nix\/store\/[a-z0-9]{32}-[A-Za-z0-9+._?-]+$/.test(runtime) ||
      !Array.isArray(closure) || !closure.includes(runtime) || closure.length > 256 ||
      closure.some(p => !/^\/nix\/store\/[a-z0-9]{32}-[A-Za-z0-9+._?-]+$/.test(p)) ||
      !/^\/tmp\/swarm-policy-[A-Za-z0-9]+\/[a-z0-9-]+$/.test(fixture) ||
      !Array.isArray(command) || !command.length || command.length > 32 ||
      command.some(p => typeof p !== 'string' || p.length > 4096 || /[\x00-\x1f]/.test(p))) {
    throw new Error('INVALID_BOUNDARY_INPUT');
  }
  const args = ['--unshare-all', '--unshare-user', '--disable-userns', '--cap-drop', 'ALL',
    '--new-session', '--die-with-parent', '--clearenv', '--tmpfs', '/'];
  for (const path of [...new Set(closure)].sort()) args.push('--ro-bind', path, path);
  args.push('--ro-bind', runtime, '/runtime');
  for (const name of ['home', 'work', 'etc', 'fixture', 'package']) args.push('--ro-bind', `${fixture}/${name}`, `/${name}`);
  // Fresh proc belongs to the NEW PID namespace, never the host's proc mount.
  args.push('--proc', '/proc', '--dev', '/dev', '--size', '33554432', '--tmpfs', '/state',
    '--size', '16777216', '--tmpfs', '/tmp', '--chdir', '/work');
  for (const [key, value] of Object.entries(ENV)) args.push('--setenv', key, value);
  // A copy of finite synthetic bytes, not a writable host file. Bubblewrap consumes fd4.
  // Parent/config paths stay readonly; only this runtime identity inode is mutable.
  args.push('--perms', '0600', '--bind-data', '4', '/home/probe/.codex/installation_id');
  args.push('--remount-ro', '/', '--', ...command);
  return args;
}

/** Finite output and wall-clock bounds; failure never returns stdout as evidence. */
export function boundedProcess(executable, args, { timeoutMs = 10000, input = '', seed = false, onSpawn } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 60000 || Buffer.byteLength(input) > LIMIT) {
    return Promise.resolve({ ok: false, code: 'INVALID_LIMIT', cleanup: 'not-started' });
  }
  return new Promise(resolve => {
    let child, timer, killTimer, finished = false, total = 0, reason = null;
    const chunks = [];
    const finish = (value) => { if (!finished) { finished = true; clearTimeout(timer); clearTimeout(killTimer); resolve(value); } };
    const fail = code => {
      if (finished) return;
      reason ??= code; child?.kill('SIGKILL');
      killTimer ??= setTimeout(() => {
        child?.stdout.destroy(); child?.stderr.destroy(); child?.stdin.destroy(); child?.stdio[4]?.destroy();
        finish({ ok: false, code: reason, cleanup: 'unknown' });
      }, 2000);
    };
    try {
      // No shell, inherited socket/TTY/fds, loader hooks or user environment.
      child = spawn(executable, args, { env: { LANG: 'C.UTF-8' }, cwd: '/', stdio: seed ? ['pipe', 'pipe', 'pipe', 'ignore', 'pipe'] : ['pipe', 'pipe', 'pipe'] });
      if (seed) { child.stdio[4].on('error', () => fail('SEED_PIPE_FAILED')); child.stdio[4].end(INSTALLATION_SEED); }
      timer = setTimeout(() => fail('DEADLINE'), timeoutMs);
      child.on('error', () => finish({ ok: false, code: 'START_FAILED', cleanup: 'not-started' }));
      for (const stream of [child.stdout, child.stderr]) {
        stream.on('error', () => fail('PIPE_FAILED'));
        stream.on('data', chunk => {
          total += chunk.length;
          if (total > LIMIT) fail('OUTPUT_LIMIT');
          else if (stream === child.stdout && !reason) chunks.push(chunk);
        });
      }
      child.stdin.on('error', () => fail('PIPE_FAILED'));
      child.on('close', (code, signal) => finish(reason || code !== 0
        ? { ok: false, code: reason ?? 'PROCESS_FAILED', exitCode: code, signal, cleanup: 'reaped' }
        : { ok: true, stdout: Buffer.concat(chunks).toString('utf8'), cleanup: 'reaped' }));
      onSpawn?.(child);
      child.stdin.end(input);
    } catch { fail('START_FAILED'); finish({ ok: false, code: 'START_FAILED', cleanup: child ? 'unknown' : 'not-started' }); }
  });
}

export async function digestTree(root) {
  const hash = createHash('sha256'); let count = 0, total = 0;
  async function walk(path, relative) {
    const stat = await lstat(path);
    if (++count > 256 || stat.isSymbolicLink()) throw new Error('UNSUPPORTED_INPUT_TREE');
    hash.update(`${relative}\0${stat.mode & 0o777}\0`);
    if (stat.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await walk(`${path}/${name}`, `${relative}/${name}`);
    } else if (stat.isFile()) {
      if ((total += stat.size) > 512 * 1024 * 1024) throw new Error('INPUT_LIMIT');
      hash.update(`${stat.size}\0`);
      for await (const chunk of createReadStream(path, { flags: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK })) hash.update(chunk);
    } else throw new Error('UNSUPPORTED_INPUT_TREE');
  }
  await walk(root, '');
  return hash.digest('hex');
}

export function summarizePages(pages, required = REQUIRED) {
  const features = {}; const cursors = new Set();
  if (!Array.isArray(pages) || !pages.length || pages.length > 32) throw new Error('FEATURE_PAGES_INVALID');
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (!page || !Array.isArray(page.data) || page.data.length > 256 ||
      !(page.nextCursor === null || typeof page.nextCursor === 'string')) throw new Error('FEATURE_PAGES_INVALID');
    for (const item of page.data) {
      if (!item || typeof item.name !== 'string' || !/^[a-z][a-z0-9_]{0,95}$/.test(item.name) ||
        typeof item.enabled !== 'boolean' || Object.hasOwn(features, item.name)) throw new Error('FEATURE_ROWS_INVALID');
      Object.defineProperty(features, item.name, { value: item.enabled, enumerable: true });
    }
    const last = i === pages.length - 1;
    if ((page.nextCursor === null) !== last || (page.nextCursor !== null &&
       (!page.nextCursor.length || page.nextCursor.length > 4096 || cursors.has(page.nextCursor)))) throw new Error('FEATURE_PAGES_INCOMPLETE');
    if (page.nextCursor !== null) cursors.add(page.nextCursor);
  }
  return { features, missing: required.filter(name => !Object.hasOwn(features, name)), pages: pages.length };
}

export async function sameNamespace(pid, namespace) {
  try { return await readlink(`/proc/${pid}/ns/pid`) === namespace; } catch { return false; }
}
