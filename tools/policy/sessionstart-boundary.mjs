// Synthetic SessionStart boundary controls. Importing this module starts nothing.
import { spawn } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { readlinkSync, writeFileSync, lstatSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { lstat, readFile, readdir, readlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ENV, INSTALLATION_SEED, boundedProcess } from './boundary.mjs';

export const SESSIONSTART_BOUNDARY_KEYS = Object.freeze([
  'sessionstartInputsReadonly', 'sessionstartAncestorsReadonly',
  'privateLoopbackReachable', 'privateLoopbackClosed', 'samePortOutboundDenied',
  'sessionstartFamilyMembership', 'sessionstartHostListenerAbsent',
  'sessionstartOwnerDeathCleanup', 'sessionstartDeadlineCleanup', 'sessionstartOutputCleanup',
]);
const PORT = 43129;
const ROLES = ['responder', 'canary', 'codex-substitute'];
const MODULES = ['inner.mjs', 'boundary.mjs', 'activation-contract.mjs', 'plugin-activation-contract.mjs', 'canary.mjs',
  'sessionstart-boundary.mjs', 'sessionstart-contract.mjs', 'sessionstart.mjs',
  'sessionstart-response.mjs', 'sessionstart-canary.mjs'];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
const denied = fn => { try { fn(); return false; } catch (error) { return ['EROFS', 'EACCES', 'EPERM'].includes(error.code); } };

export function sessionstartReadonlyChecks() {
  const files = ['/home/probe/.codex/config.toml', '/home/probe/.codex/hooks.json',
    '/fixture/sessionstart-proof', ...MODULES.map(name => `/fixture/${name}`)];
  const ancestors = ['/', '/home', '/home/probe', '/home/probe/.codex', '/fixture'];
  return {
    sessionstartInputsReadonly: files.every(path => lstatSync(path).isFile() &&
      denied(() => writeFileSync(path, 'changed')) && denied(() => unlinkSync(path))),
    sessionstartAncestorsReadonly: ancestors.every(path => lstatSync(path).isDirectory() &&
      denied(() => mkdirSync(`${path}/sessionstart-injected`)) &&
      (path === '/' || denied(() => renameSync(path, `${path}-sessionstart-replaced`)))),
  };
}

function connection(host) {
  return new Promise(resolve => {
    const socket = connect({ host, port: PORT });
    let done = false;
    const finish = outcome => { if (!done) { done = true; socket.destroy(); resolve(outcome); } };
    socket.setTimeout(500);
    socket.once('connect', () => finish('connected'));
    socket.once('error', error => finish(error.code));
    socket.once('timeout', () => finish('timeout'));
  });
}

async function listen() {
  const server = createServer(socket => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: PORT, exclusive: true }, resolve);
  });
  return server;
}

export async function sessionstartEndpointChecks() {
  const server = await listen();
  let reachable;
  try { reachable = await connection('127.0.0.1') === 'connected'; }
  finally { await new Promise(resolve => server.close(resolve)); }
  return {
    privateLoopbackReachable: reachable,
    privateLoopbackClosed: await connection('127.0.0.1') === 'ECONNREFUSED',
    samePortOutboundDenied: ['ENETUNREACH', 'EHOSTUNREACH', 'EACCES', 'EPERM'].includes(await connection('192.0.2.1')),
  };
}

function namespaceIdentity() {
  return { namespace: readlinkSync('/proc/self/ns/pid'), networkNamespace: readlinkSync('/proc/self/ns/net') };
}

async function familyRole(role) {
  if (!ROLES.includes(role) || process.argv[1] !== '/fixture/sessionstart-boundary.mjs' ||
      JSON.stringify(Object.keys(process.env).sort()) !== JSON.stringify(Object.keys(ENV).sort()) ||
      !Object.entries(ENV).every(([key, value]) => process.env[key] === value) || process.cwd() !== '/work') {
    throw new Error('SYNTHETIC_FAMILY_CONTEXT_INVALID');
  }
  // Fixed synthetic children only; the actual Codex and hook driver are never imported.
  if (role === 'responder') await listen();
  if (role === 'canary') writeFileSync('/state/sessionstart-family-canary', 'synthetic-family-only');
  emit({ role, pid: process.pid, ...namespaceIdentity() });
  setInterval(() => {}, 1000);
}

export async function sessionstartFamilyHold() {
  const identity = namespaceIdentity();
  const roles = await Promise.all(ROLES.map(role => new Promise((resolve, reject) => {
    const child = spawn('/runtime/bin/node', ['/fixture/sessionstart-boundary.mjs', 'family-role', role],
      { env: ENV, cwd: '/work', stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => finish(new Error('FAMILY_START_DEADLINE')), 2000);
    child.on('error', error => finish(error));
    child.on('exit', () => finish(new Error('FAMILY_EARLY_EXIT')));
    child.stderr.on('data', () => finish(new Error('FAMILY_STDERR')));
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 4096) { finish(new Error('FAMILY_OUTPUT_LIMIT')); return; }
      if (!output.includes('\n')) return;
      try {
        const value = JSON.parse(output.trim());
        if (value.role !== role || value.pid !== child.pid || value.namespace !== identity.namespace ||
            value.networkNamespace !== identity.networkNamespace) throw new Error('FAMILY_IDENTITY_INVALID');
        finish(null, value);
      } catch (error) { finish(error); }
    });
  })));
  const internalReachable = await connection('127.0.0.1') === 'connected';
  emit({ holding: true, ...identity, roles, internalReachable });
  // Only the disposable owner requests flood after the host checks the live family.
  process.stdin.setEncoding('utf8');
  let input = '', flooding = false;
  const flood = () => {
    while (process.stdout.write('x'.repeat(4096))) { /* bounded by stream backpressure */ }
    process.stdout.once('drain', flood);
  };
  process.stdin.on('data', chunk => {
    input += chunk;
    if (input === 'flood\n' && !flooding) { flooding = true; flood(); }
    if (input.length > 32) process.exit(1);
  });
  setInterval(() => {}, 1000);
}

// Read only /proc metadata for same-UID processes, which all fixed descendants
// retain (no capabilities, setuid resources, or nested user namespaces).
export async function ownedNamespaceProcesses(namespace) {
  const found = [];
  const namespacePids = status => status.match(/^NSpid:[ \t]+([\d \t]+)$/m)?.[1].trim().split(/[ \t]+/).map(Number);
  const minimumDepth = (namespacePids(await readFile('/proc/self/status', 'utf8'))?.length ?? 0) + 1;
  if (minimumDepth < 2) throw new Error('HOST_NAMESPACE_DEPTH_UNAVAILABLE');
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      if ((await lstat(`/proc/${name}`)).uid !== process.getuid()) continue;
      const status = await readFile(`/proc/${name}/status`, 'utf8');
      if (/^State:\s+Z/m.test(status)) continue;
      const ids = namespacePids(status);
      if (!ids) throw new Error('PROCESS_NAMESPACE_DEPTH_UNAVAILABLE');
      // A process in the host namespace cannot be in our newly nested one.
      // Check this public metadata before potentially restricted ns symlinks.
      if (ids.length < minimumDepth) continue;
      if (await readlink(`/proc/${name}/ns/pid`) !== namespace) continue;
      found.push({ pid: Number(name), innerPid: ids?.at(-1),
        networkNamespace: await readlink(`/proc/${name}/ns/net`) });
    } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
  }
  return found;
}

async function familyOwner(runtime, args) {
  const child = spawn(`${runtime}/bin/bwrap`, ['--info-fd', '3', ...args], {
    env: { LANG: 'C.UTF-8' }, cwd: '/', stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
  });
  let info = '', output = '', reported = false, stderrBytes = 0;
  const fail = () => { child.kill('SIGKILL'); process.exitCode = 1; };
  child.on('error', fail);
  child.stdin.on('error', fail); child.stdio[4].on('error', fail);
  child.stdio[4].end(INSTALLATION_SEED);
  child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 4096) fail(); });
  process.on('SIGUSR1', () => { if (reported) child.stdin.write('flood\n'); });
  function ready() {
    if (reported || !info.includes('}') || !output.includes('\n')) return;
    try {
      const parsed = JSON.parse(info), held = JSON.parse(output.trim());
      if (!Number.isInteger(parsed['child-pid']) || !held.holding) throw new Error();
      reported = true; emit({ ...held, pid: parsed['child-pid'] });
    } catch { fail(); }
  }
  child.stdio[3].on('data', chunk => { info += chunk; if (info.length > 4096) fail(); else ready(); });
  child.stdout.on('data', chunk => {
    if (reported) {
      if (!process.stdout.write(chunk)) {
        child.stdout.pause(); process.stdout.once('drain', () => child.stdout.resume());
      }
    }
    else { output += chunk; if (output.length > 4096) fail(); else ready(); }
  });
  child.on('close', () => { process.exitCode = 1; });
}

export function sessionstartFamilyMembership(observation, processes) {
  if (!observation || observation.internalReachable !== true ||
      !/^pid:\[\d+\]$/.test(observation.namespace ?? '') || !/^net:\[\d+\]$/.test(observation.networkNamespace ?? '') ||
      !Number.isInteger(observation.pid) || observation.pid <= 1 || !Array.isArray(processes) ||
      !processes.every(item => item && Number.isInteger(item.pid) && item.pid > 1 &&
        Number.isInteger(item.innerPid) && item.innerPid > 0 && typeof item.networkNamespace === 'string') ||
      !Array.isArray(observation.roles) || observation.roles.length !== ROLES.length ||
      new Set(observation.roles.map(item => item?.pid)).size !== ROLES.length) return false;
  return processes.some(item => item.pid === observation.pid && item.networkNamespace === observation.networkNamespace) &&
    ROLES.every(role => {
      const matches = observation.roles.filter(item => item?.role === role);
      return matches.length === 1 && Number.isInteger(matches[0].pid) && matches[0].pid > 1 &&
        matches[0].namespace === observation.namespace && matches[0].networkNamespace === observation.networkNamespace &&
        processes.some(item => item.innerPid === matches[0].pid && item.networkNamespace === observation.networkNamespace);
    });
}

export async function verifySessionstartLifetime(runtime, args, trigger) {
  if (!['owner', 'deadline', 'output'].includes(trigger)) throw new Error('FAMILY_TRIGGER_INVALID');
  let observation, membership = false, hostAbsent = false, readiness, diagnostic = null;
  const result = await boundedProcess(`${runtime}/bin/node`,
    [fileURLToPath(import.meta.url), 'family-owner', runtime, JSON.stringify(args)], {
      timeoutMs: trigger === 'deadline' ? 1800 : 5000,
      onSpawn(child) {
        let output = '';
        child.stdout.on('data', chunk => {
          if (readiness) return;
          output += chunk;
          if (output.length > 4096 || !output.includes('\n')) return;
          readiness = (async () => {
            try {
              observation = JSON.parse(output.trim());
              if (!/^pid:\[\d+\]$/.test(observation.namespace) || !/^net:\[\d+\]$/.test(observation.networkNamespace) ||
                  observation.namespace === await readlink('/proc/self/ns/pid') ||
                  observation.networkNamespace === await readlink('/proc/self/ns/net')) throw new Error();
              const processes = await ownedNamespaceProcesses(observation.namespace);
              membership = sessionstartFamilyMembership(observation, processes);
              hostAbsent = await connection('127.0.0.1') === 'ECONNREFUSED';
              if (!membership || !hostAbsent) child.kill('SIGKILL');
              else if (trigger === 'owner') child.kill('SIGKILL');
              else if (trigger === 'output') child.kill('SIGUSR1');
            } catch (error) { diagnostic = /^[A-Z_]+$/.test(error.code ?? '') ? error.code : 'FAMILY_VERIFICATION_FAILED'; child.kill('SIGKILL'); }
          })();
        });
      },
    });
  await readiness;
  let empty = false;
  if (observation?.namespace && membership) {
    for (let attempt = 0; attempt < 40; attempt++) {
      try { empty = (await ownedNamespaceProcesses(observation.namespace)).length === 0; } catch { break; }
      if (empty) break;
      await pause(50);
    }
  }
  const termination = !result.ok && result.cleanup === 'reaped' &&
    (trigger === 'owner' ? result.code === 'PROCESS_FAILED' && result.signal === 'SIGKILL'
      : result.code === (trigger === 'deadline' ? 'DEADLINE' : 'OUTPUT_LIMIT'));
  return { membership, hostAbsent, cleaned: membership && hostAbsent && empty && termination,
    cleanupSafe: empty || result.cleanup === 'not-started',
    evidence: { trigger, roles: observation?.roles ?? [], namespace: observation?.namespace,
      networkNamespace: observation?.networkNamespace, internalReachable: observation?.internalReachable === true,
      hostAbsent, membership, noRemainingNamespaceProcesses: empty,
      terminationCode: result.ok ? 'UNEXPECTED_SUCCESS' : result.code, diagnostic } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'family-role') await familyRole(process.argv[3]);
    else if (process.argv[2] === 'family-owner') await familyOwner(process.argv[3], JSON.parse(process.argv[4]));
    else throw new Error('SESSIONSTART_BOUNDARY_MODE_INVALID');
  } catch { process.exitCode = 1; }
}
