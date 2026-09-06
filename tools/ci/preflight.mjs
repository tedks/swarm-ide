import { spawnSync } from 'node:child_process';
import { openSync, readSync, closeSync, constants } from 'node:fs';
import { release } from 'node:os';
import { pathToFileURL } from 'node:url';

const OUTPUT_LIMIT = 16 * 1024;
const TIME_LIMIT = 3000;
const store = '/nix/store/[a-z0-9]{32}-[A-Za-z0-9+._?-]+';
const runtimePattern = /^\/nix\/store\/[a-z0-9]{32}-swarm-offline-policy-runtime(?![\s\S])/;
const unsharePattern = new RegExp(`^${store}/bin/unshare(?![\\s\\S])`);

// Fixed public kernel interfaces only. Never read arbitrary paths or dump environment.
function smallRead(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const buffer = Buffer.alloc(4096);
    const size = readSync(fd, buffer, 0, buffer.length, null);
    return buffer.subarray(0, size).toString('utf8').trim();
  } catch { return 'unavailable'; }
  finally { if (fd !== undefined) closeSync(fd); }
}

export function platformFacts() {
  const os = smallRead('/etc/os-release');
  const status = smallRead('/proc/self/status');
  return {
    platform: process.platform, kernel: release(), uid: process.getuid?.() ?? null,
    os: os.split('\n').filter(line => /^(ID|VERSION_ID)=/.test(line)),
    apparmorEnabled: smallRead('/sys/module/apparmor/parameters/enabled'),
    apparmorProfile: smallRead('/proc/self/attr/current'),
    apparmorRestrictUserns: smallRead('/proc/sys/kernel/apparmor_restrict_unprivileged_userns'),
    unprivilegedUsernsClone: smallRead('/proc/sys/kernel/unprivileged_userns_clone'),
    maxUserNamespaces: smallRead('/proc/sys/user/max_user_namespaces'),
    processSecurity: status.split('\n').filter(line => /^(Seccomp|Seccomp_filters|NoNewPrivs|CapEff):/.test(line)),
  };
}

export function probeDefinitions(runtime, unshare) {
  if (!runtimePattern.test(runtime) || !unsharePattern.test(unshare)) throw new Error('INVALID_NIX_EXECUTABLE');
  const truth = `${runtime}/bin/true`;
  return [
    { stage: 'user-namespace-create', executable: unshare, args: ['--user', '--', truth] },
    { stage: 'user-namespace-map', executable: unshare, args: ['--user', '--map-current-user', '--', truth] },
    { stage: 'owned-process-prerequisite', executable: unshare,
      args: ['--user', '--map-current-user', '--pid', '--fork', '--kill-child=SIGKILL', '--mount-proc', '--', truth] },
    // A minimal bootstrap, NOT the full boundary proof. Execute only true, never Codex.
    { stage: 'policy-namespace-bootstrap', executable: `${runtime}/bin/bwrap`,
      args: ['--unshare-all', '--unshare-user', '--disable-userns', '--cap-drop', 'ALL', '--new-session',
        '--die-with-parent', '--clearenv', '--ro-bind', '/nix/store', '/nix/store',
        '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--', truth] },
  ];
}

export function summarize(result) {
  const stderr = Buffer.from(result.stderr ?? '').subarray(0, OUTPUT_LIMIT).toString('utf8');
  const stdout = Buffer.from(result.stdout ?? '').subarray(0, OUTPUT_LIMIT).toString('utf8');
  const ok = result.status === 0 && !result.signal && !result.error;
  let observation = ok ? 'SUCCEEDED' : 'COMMAND_FAILED';
  if (result.error?.code === 'ETIMEDOUT') observation = 'DEADLINE';
  else if (result.error?.code === 'ENOBUFS') observation = 'OUTPUT_LIMIT';
  else if (result.error) observation = 'START_FAILED';
  // Trace evidence identifies the operation/errno, not the responsible security policy.
  const denied = stderr.split('\n').filter(line => /= -1 (EPERM|EACCES|ENOSYS)\b/.test(line));
  return { ok, observation, exitCode: result.status ?? null, signal: result.signal ?? null,
    denied, stdout, stderr };
}

export function executeProbe(runtime, probe, execute = spawnSync) {
  return summarize(execute(`${runtime}/bin/strace`, [
    '-f', '-s', '160', '-e', 'trace=unshare,clone,clone3,mount,capset,write', '--', probe.executable, ...probe.args,
  ], { cwd: '/', env: { LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'],
    timeout: TIME_LIMIT, killSignal: 'SIGKILL', maxBuffer: OUTPUT_LIMIT }));
}

export function report(facts, probes) {
  const platformReady = facts.platform === 'linux' && Number.isInteger(facts.uid) && facts.uid > 0;
  const complete = probes.length === 4 && probes.every((probe, index) => probe.stage === [
    'user-namespace-create', 'user-namespace-map', 'owned-process-prerequisite', 'policy-namespace-bootstrap',
  ][index]);
  const ok = platformReady && complete && probes.every(probe => probe.ok === true);
  return { schemaVersion: 1, status: ok ? 'PREREQUISITES_PASSED' : 'LINUX_PREREQUISITE_UNAVAILABLE',
    fullIsolationProof: false, productionAvailable: false, codexStarted: false,
    facts, probes, next: ok
      ? 'Run unchanged mandatory policy boundary, external owned-process and owned virtual UI tests.'
      : 'Read the failed stage and syscall errno. Host-policy attribution requires separate evidence; do not disable controls or skip proofs.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const facts = platformFacts();
  try {
    if (process.argv.length !== 4) throw new Error('INVALID_ARGUMENTS');
    const [runtime, unshare] = process.argv.slice(2);
    const definitions = probeDefinitions(runtime, unshare);
    // Do not execute even harmless probes as host root or on unsupported platforms.
    const probes = facts.platform === 'linux' && facts.uid > 0
      ? definitions.map(probe => ({ stage: probe.stage, executable: probe.executable, args: probe.args,
        ...executeProbe(runtime, probe) })) : [];
    const value = report(facts, probes);
    // A single JSON line safely quotes subprocess text; never print raw CI directives.
    process.stdout.write(`${JSON.stringify(value)}\n`);
    process.exitCode = value.status === 'PREREQUISITES_PASSED' ? 0 : 1;
  } catch {
    process.stdout.write(`${JSON.stringify({ ...report(facts, []), failure: 'INVALID_PREREQUISITE_INPUT' })}\n`);
    process.exitCode = 2;
  }
}
