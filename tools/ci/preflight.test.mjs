import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { probeDefinitions, executeProbe, summarize, report } from './preflight.mjs';

const runtime = '/nix/store/00000000000000000000000000000000-swarm-offline-policy-runtime';
const unshare = '/nix/store/00000000000000000000000000000000-util-linux-bin/bin/unshare';
const definitions = probeDefinitions(runtime, unshare);
const facts = { platform: 'linux', uid: 1000 };

test('fixed probes retain the exact owned-process prerequisite and exclude model execution', () => {
  assert.deepEqual(definitions[2].args, ['--user', '--map-current-user', '--pid', '--fork',
    '--kill-child=SIGKILL', '--mount-proc', '--', `${runtime}/bin/true`]);
  assert.equal(definitions.length, 4);
  assert.ok(definitions[3].args.includes('--disable-userns'));
  assert.ok(definitions[3].args.includes('--clearenv'));
  assert.ok(!JSON.stringify(definitions).includes('codex'));
});

test('rejects relative, host-fallback, newline and traversal executable paths', () => {
  for (const bad of ['runtime', '/usr', `${runtime}/..`, `${runtime}\n`]) {
    assert.throws(() => probeDefinitions(bad, unshare));
  }
  for (const bad of ['/usr/bin/unshare', 'unshare', `${unshare}/../bash`, `${unshare}\n`]) {
    assert.throws(() => probeDefinitions(runtime, bad));
  }
});

test('spawn boundary uses fixed argv, clean environment and finite output/deadline', () => {
  executeProbe(runtime, definitions[2], (command, args, options) => {
    assert.equal(command, `${runtime}/bin/strace`);
    assert.ok(args.includes('--'));
    assert.deepEqual(args.slice(-definitions[2].args.length), definitions[2].args);
    assert.deepEqual(options.env, { LANG: 'C.UTF-8' });
    assert.equal(options.cwd, '/');
    assert.equal(options.timeout, 3000);
    assert.equal(options.maxBuffer, 16384);
    assert.equal(options.killSignal, 'SIGKILL');
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
    return { status: 0, stdout: '', stderr: '' };
  });
});

test('reports observation without claiming AppArmor attribution', () => {
  const result = summarize({ status: 1, stderr: 'unshare(CLONE_NEWUSER) = -1 EPERM (Operation not permitted)\n' });
  assert.equal(result.ok, false);
  assert.equal(result.denied.length, 1);
  assert.equal(result.observation, 'COMMAND_FAILED');
  assert.ok(!JSON.stringify(result).includes('APPARMOR'));
});

test('every required stage must pass once, in order, as non-root Linux', () => {
  const passing = definitions.map(probe => ({ stage: probe.stage, ok: true }));
  assert.equal(report(facts, passing).status, 'PREREQUISITES_PASSED');
  for (let index = 0; index < 4; index++) {
    assert.equal(report(facts, passing.map((p, i) => i === index ? { ...p, ok: false } : p)).status,
      'LINUX_PREREQUISITE_UNAVAILABLE');
  }
  for (const bad of [[], passing.slice(1), [...passing, passing[0]], [...passing].reverse()]) {
    assert.equal(report(facts, bad).status, 'LINUX_PREREQUISITE_UNAVAILABLE');
  }
  for (const bad of [{ ...facts, uid: 0 }, { ...facts, uid: null }, { ...facts, platform: 'darwin' }]) {
    assert.equal(report(bad, passing).status, 'LINUX_PREREQUISITE_UNAVAILABLE');
  }
  assert.equal(report(facts, passing).productionAvailable, false);
  assert.equal(report(facts, passing).fullIsolationProof, false);
});

test('actual safe executable success and failure remain distinct', () => {
  for (const [code, expected] of [[0, true], [7, false]]) {
    const result = spawnSync(process.execPath, ['-e', `process.exit(${code})`], { env: {}, timeout: 1000 });
    assert.equal(summarize(result).ok, expected);
  }
});

test('real timeout and output overflow cannot produce success', () => {
  const timeout = spawnSync(process.execPath, ['-e', 'setInterval(()=>{},1000)'],
    { env: {}, timeout: 100, killSignal: 'SIGKILL', maxBuffer: 16384 });
  assert.equal(summarize(timeout).observation, 'DEADLINE');
  const flood = spawnSync(process.execPath, ['-e', 'process.stdout.write("x".repeat(131072))'],
    { env: {}, timeout: 1000, killSignal: 'SIGKILL', maxBuffer: 16384 });
  assert.equal(summarize(flood).observation, 'OUTPUT_LIMIT');
  assert.ok(Buffer.byteLength(summarize(flood).stdout) <= 16384);
});

test('JSON rendering cannot emit a raw workflow command or unbounded stderr', () => {
  const value = summarize({ status: 1, stderr: '\n::error::synthetic\n' + 'x'.repeat(20000) });
  const encoded = JSON.stringify(value);
  assert.equal(encoded.split('\n').length, 1);
  assert.ok(Buffer.byteLength(value.stderr) <= 16384);
});

test('public wrapper rejects arguments before dependency acquisition or probes', () => {
  const wrapper = fileURLToPath(new URL('./preflight.sh', import.meta.url));
  const result = spawnSync('bash', [wrapper, '--help'], { env: { PATH: process.env.PATH }, timeout: 1000 });
  assert.equal(result.status, 2);
  assert.match(result.stderr.toString(), /LINUX_PREREQUISITE_INVALID_ARGUMENTS/);
});
