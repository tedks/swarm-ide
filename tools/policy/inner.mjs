// This file is run ONLY inside the independent bubblewrap boundary.
import { readFileSync, writeFileSync, writeSync, mkdirSync, renameSync, unlinkSync, existsSync, readdirSync, readlinkSync, openSync, closeSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { ENV, REQUIRED, summarizePages, LIMIT, INSTALLATION_SEED } from './boundary.mjs';

const mode = process.argv[2];
const denied = fn => { try { fn(); return false; } catch (error) { return ['EROFS', 'EACCES', 'EPERM'].includes(error.code); } };
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');

async function boundary() {
  const status = readFileSync('/proc/self/status', 'utf8');
  const expected = Object.keys(ENV).sort();
  const keys = Object.keys(process.env).sort();
  const checks = {
    exactEnvironment: JSON.stringify(keys) === JSON.stringify(expected) && expected.every(key => process.env[key] === ENV[key]),
    noCredentialsOrBus: ['/home/tedks', '/run', '/sys', '/etc/passwd', '/home/probe/.codex/auth.json'].every(path => !existsSync(path)),
    rootReadonly: denied(() => mkdirSync('/new-root')),
    homeReadonly: denied(() => renameSync('/home/probe', '/home/replaced')),
    configReadonly: denied(() => writeFileSync('/home/probe/.codex/config.toml', 'changed')),
    configParentReadonly: denied(() => renameSync('/home/probe/.codex', '/home/probe/replaced')),
    installationIdentityCannotReplace: denied(() => unlinkSync('/home/probe/.codex/installation_id')) &&
      denied(() => renameSync('/home/probe/.codex/installation_id', '/home/probe/.codex/replaced')),
    workReadonly: denied(() => writeFileSync('/work/.codex/config.toml', 'changed')),
    managedReadonly: denied(() => writeFileSync('/etc/codex/requirements.toml', 'changed')),
    packageReadonly: denied(() => writeFileSync('/package/replacement', 'changed')),
    noCapabilities: ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb'].every(key => new RegExp(`^${key}:\\s+0+$`, 'm').test(status)),
    noNewPrivileges: /^NoNewPrivs:\s+1$/m.test(status),
    canonicalRoot: process.cwd() === '/work',
  };
  const identity = '/home/probe/.codex/installation_id';
  checks.installationSeedMatches = readFileSync(identity, 'utf8') === INSTALLATION_SEED;
  const identityFd = openSync(identity, 'a+'); closeSync(identityFd);
  writeFileSync(identity, '00000000-0000-4000-8000-000000000002\n');
  checks.installationIdentityWritable = readFileSync(identity, 'utf8').includes('000000000002');
  writeFileSync(identity, INSTALLATION_SEED);
  mkdirSync('/state/run', { recursive: true });
  writeFileSync('/state/control', 'synthetic');
  checks.stateWritable = readFileSync('/state/control', 'utf8') === 'synthetic';
  // Node adds only its own eventpoll/pipes/eventfd and /dev/null descriptors.
  checks.noHostDescriptors = readdirSync('/proc/self/fd').every(fd => {
    if (Number(fd) <= 2) return true;
    try { return /^(pipe:\[|anon_inode:|\/dev\/null$|\/proc\/\d+\/fd$)/.test(readlinkSync(`/proc/self/fd/${fd}`)); }
    catch (error) { return error.code === 'ENOENT'; } // readdir's own descriptor closes before this walk.
  });
  const deniedConnect = address => new Promise(resolve => {
    const socket = connect({ host: address, port: 9 });
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
  checks.networkNamespaceEmpty = readdirSync('/proc/self/net').includes('route') &&
    readFileSync('/proc/net/route', 'utf8').trim().split('\n').length === 1;
  checks.outboundDenied = await deniedConnect('192.0.2.1') && await deniedConnect('127.0.0.1');
  const positive = spawnSync('/runtime/bin/node', ['/fixture/canary.mjs', 'positive'], { env: ENV, timeout: 2000 });
  checks.canaryExecutable = positive.status === 0 && readFileSync('/state/positive', 'utf8') === 'synthetic-canary';
  return checks;
}

async function inspect() {
  const checks = await boundary();
  if (Object.values(checks).some(v => v !== true)) { emit({ status: 'BOUNDARY_UNAVAILABLE', checks, codexStarted: false }); return; }
  const args = ['-c', 'sqlite_home="/state/sqlite"', '-c', 'log_dir="/state/logs"',
    '-c', 'otel.exporter="none"', '-c', 'otel.trace_exporter="none"', '-c', 'otel.metrics_exporter="none"',
    '-c', 'otel.log_user_prompt=false', '-c', 'analytics.enabled=false',
    'app-server', '--listen', 'stdio://', '--strict-config'];
  // Diagnostic mode traces file-operation metadata only, never read/write buffers.
  const server = mode === 'inspect-trace'
    ? spawn('/runtime/bin/strace', ['-f', '-e', 'trace=%file', '/package/bin/codex', ...args], { env: ENV, cwd: '/work', stdio: ['pipe', 'pipe', 'pipe'] })
    : spawn('/package/bin/codex', args, { env: ENV, cwd: '/work', stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let id = 0, bytes = 0, buffer = '', fault = null, diagnostic = '', traceTail = '';
  const readonlyFailures = new Set();
  function fail(code) { fault ??= code; server.kill('SIGKILL'); for (const { reject } of pending.values()) reject(new Error(fault)); pending.clear(); }
  server.on('error', () => fail('SERVER_START_FAILED'));
  server.on('exit', () => fail('SERVER_EXITED'));
  server.stdin.on('error', () => fail('SERVER_PIPE_FAILED'));
  server.stderr.on('data', chunk => {
    bytes += chunk.length;
    // Only this synthetic, credential-free process's startup diagnostics. Never config dumps.
    diagnostic = (diagnostic + chunk.toString('utf8')).slice(-2048);
    if (mode === 'inspect-trace') {
      traceTail += chunk.toString('utf8');
      let end;
      while ((end = traceTail.indexOf('\n')) >= 0) {
        const line = traceTail.slice(0, end); traceTail = traceTail.slice(end + 1);
        if (line.includes('EROFS') && readonlyFailures.size < 16) {
          const path = line.match(/"(\/(?:home\/probe|work|state|tmp)[A-Za-z0-9_./-]*)"/)?.[1];
          if (path) readonlyFailures.add(path);
        }
      }
    }
    if (bytes > LIMIT) fail('SERVER_OUTPUT_LIMIT');
  });
  server.stdout.on('data', chunk => {
    bytes += chunk.length; if (bytes > LIMIT) { fail('SERVER_OUTPUT_LIMIT'); return; }
    buffer += chunk.toString('utf8');
    for (;;) {
      const end = buffer.indexOf('\n'); if (end < 0) break;
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      let value; try { value = JSON.parse(line); } catch { fail('SERVER_INVALID_JSON'); return; }
      if (value && Object.hasOwn(value, 'id') && value.method) { fail('SERVER_UNEXPECTED_REQUEST'); return; }
      if (value && pending.has(value.id)) {
        const operation = pending.get(value.id); pending.delete(value.id);
        if (Object.hasOwn(value, 'result') && !Object.hasOwn(value, 'error')) operation.resolve(value.result);
        else operation.reject(new Error('SERVER_RPC_REJECTED'));
      }
    }
  });
  function request(method, params) {
    if (fault) return Promise.reject(new Error(fault));
    return new Promise((resolve, reject) => {
      const key = ++id; pending.set(key, { resolve, reject });
      server.stdin.write(JSON.stringify({ id: key, method, ...(params === undefined ? {} : { params }) }) + '\n');
    });
  }
  const timer = setTimeout(() => fail('SERVER_DEADLINE'), 5000);
  try {
    const init = await request('initialize', { clientInfo: { name: 'swarm-policy-fixture', version: '1' } });
    if (init?.codexHome !== ENV.CODEX_HOME) throw new Error('CODEX_HOME_MISMATCH');
    server.stdin.write('{"method":"initialized"}\n');
    const config = await request('config/read', { cwd: '/work', includeLayers: true });
    const pages = []; let cursor;
    for (let page = 0; page < 32; page++) {
      const response = await request('experimentalFeature/list', { limit: 16, ...(cursor ? { cursor } : {}) });
      pages.push(response);
      if (response?.nextCursor === null) break;
      if (typeof response?.nextCursor !== 'string') throw new Error('FEATURE_PAGES_INVALID');
      cursor = response.nextCursor;
    }
    const observed = summarizePages(pages, REQUIRED);
    const requirements = await request('configRequirements/read');
    if (!requirements || !Object.hasOwn(requirements, 'requirements') ||
      !(requirements.requirements === null || typeof requirements.requirements === 'object')) throw new Error('REQUIREMENTS_MISSING');
    if (!config || typeof config.config !== 'object' || !Array.isArray(config.layers)) throw new Error('CONFIG_MISSING');
    const c = config.config;
    const canaries = ['notify', 'hooks', 'mcp', 'login', 'plugin'].filter(name => existsSync(`/state/${name}`));
    emit({ status: 'OFFLINE_OBSERVED', codexStarted: true, checks,
      observations: { featurePages: observed.pages, features: observed.features, missingFeatures: observed.missing,
        layerCount: config.layers.length, requirementsPresent: requirements.requirements !== null,
        notifyEmpty: Array.isArray(c.notify) && c.notify.length === 0,
        mcpEntries: c.mcp_servers && typeof c.mcp_servers === 'object' ? Object.keys(c.mcp_servers).length : null,
        loginShellFalse: c.allow_login_shell === false,
        sqlitePathMatches: c.sqlite_home === '/state/sqlite', logPathMatches: c.log_dir === '/state/logs',
        canariesObserved: canaries },
      unproved: ['effective-per-executor-and-plugin-MCP', 'legacy-notify-activation-without-turn',
        'builtin-executor-hooks', 'persisted-remote-control-and-plugin-state', 'telemetry-runtime-state',
        'thread-policy', 'credentialed-production-equivalence'] });
  } catch (error) { emit({ status: /^[A-Z_]+$/.test(error.message) ? error.message : 'INSPECTION_FAILED', checks, codexStarted: true,
    diagnostic: mode === 'inspect-trace' ? 'Synthetic startup file-operation trace; only EROFS paths retained.' : diagnostic.replace(/\x1b\[[0-9;]*m/g, '').replace(/[^\x20-\x7e\n]/g, '?').slice(-2048),
    readonlyFailures: [...readonlyFailures] }); }
  finally { clearTimeout(timer); server.kill('SIGKILL'); }
}

try {
  if (mode === 'boundary') emit({ checks: await boundary(), namespace: readlinkSync('/proc/self/ns/pid'), networkNamespace: readlinkSync('/proc/self/ns/net') });
  else if (mode === 'hold') {
    const child = spawn('/runtime/bin/node', ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore', env: ENV });
    child.unref(); emit({ holding: true, namespace: readlinkSync('/proc/self/ns/pid'), descendant: child.pid });
    setInterval(() => {}, 1000);
  } else if (mode === 'flood') { for (;;) writeSync(1, 'x'.repeat(4096)); }
  else if (mode === 'inspect' || mode === 'inspect-trace') await inspect();
  else throw new Error('MODE_INVALID');
} catch { emit({ status: 'INNER_CHECK_FAILED', codexStarted: false }); process.exitCode = 1; }
