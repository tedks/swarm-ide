import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { disposeContainer } from './cleanup.mjs';
import { parseStatus, isRenderer } from './sandbox-proof.cjs';
const read = (name) => readFileSync(name.startsWith('../../')
  ? resolve(process.env.SWARM_CONTAINER_SOURCE_ROOT, name.slice(6))
  : new URL(name, import.meta.url), 'utf8');

test('renderer sandbox status parses actual proc fields without nested escaping', () => {
  assert.deepEqual(parseStatus('122', 'Name:\telectron\nNSpid:\t122\t7\nNoNewPrivs:\t1\nSeccomp:\t2\n'),
    { pid: '122', nspid: ['122', '7'], seccomp: '2', noNewPrivs: '1' });
  assert.deepEqual(parseStatus('1', ''), { pid: '1', nspid: undefined, seccomp: undefined, noNewPrivs: undefined });
  assert(isRenderer('/electron\0--type=renderer\0--enable-sandbox\0'));
  assert(isRenderer('/electron --type=renderer --enable-sandbox\0'));
  assert(!isRenderer('/electron\0--type=utility\0'));
  assert(!isRenderer('/electron\0--example=--type=renderer\0'));
});

test('localhost display transport, no host control mounts or added capabilities', () => {
  const compose = read('../../compose.yaml');
  assert.match(compose, /127\.0\.0\.1:\$\{SWARM_DEMO_PORT:-6080\}:6080/);
  assert.match(compose, /cap_drop: \[ALL\]/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /seccomp=\.\/tools\/container\/seccomp.json/);
  assert.doesNotMatch(compose, /privileged:|network_mode:|\/var\/run\/docker|cap_add:|seccomp=unconfined|\$\{HOME/);
  assert.match(compose, /demo-data:\/data/);
});

test('real production Electron is nonroot and keeps its sandbox', () => {
  const docker = read('../../Dockerfile'), entry = read('entrypoint.sh');
  assert.match(docker, /bazel --batch build --jobs=3 .*\/\/:desktop-bundle/);
  assert.match(docker, /USER 1000:1000/);
  assert.match(entry, /dbus-run-session --config-file=\/opt\/runtime\/share\/dbus-1\/session.conf -- electron \/opt\/swarm\/app\/electron\/main\.js/);
  assert.match(entry, /unshare --user --map-root-user --pid --fork true/);
  assert.match(entry, /x11vnc .* -localhost -rfbport 5900/);
  assert.match(entry, /-rfbauth/);
  assert.doesNotMatch(entry, /-nopw/);
  assert.match(entry, /Xvfb .* -nolisten tcp -auth/);
  assert.doesNotMatch(entry, /electron .*--no-sandbox|electron .*--remote-debugging|SWARM_RENDERER_URL=/);
});

test('build context excludes local identity and generated reports', () => {
  const ignore = read('../../.dockerignore');
  assert.match(ignore, /^\*\*$/m);
  for (const name of ['**/.git', '**/node_modules', '**/artifacts', '**/*local-registry*', '**/work-log.json', '**/*.jsonl', '**/auth.json', '**/.env', '**/.env.*', '**/.codex', '**/.claude', '**/.ssh', '**/.aws', '**/*.pem', '**/*.key']) assert(ignore.split('\n').includes(name));
  assert(!ignore.split('\n').includes('!.swarm/**'));
  assert(ignore.split('\n').includes('/bazel-*'));
  assert(!ignore.split('\n').includes('**/bazel-*'), 'Source modules named bazel-reference.ts must remain included');
});

test('sandbox profile stays deny-by-default with documented namespace and filesystem restriction calls', () => {
  const profile = JSON.parse(read('seccomp.json'));
  assert.equal(profile.defaultAction, 'SCMP_ACT_ERRNO');
  assert.deepEqual(profile.syscalls[0].names, ['clone', 'setns', 'unshare', 'chroot']);
  assert.equal(profile.syscalls[0].action, 'SCMP_ACT_ALLOW');
  for (const name of ['mount', 'bpf', 'keyctl']) {
    assert(!profile.syscalls.some((rule) => rule.names.includes(name) && rule.action === 'SCMP_ACT_ALLOW' && !rule.includes?.caps));
  }
});

test('included architecture has contained actual source paths and connections', () => {
  const index = JSON.parse(read('demo/.swarm/plans.json'));
  assert.equal(index.version, 1);
  const ids = new Set(index.nodes.map((node) => node.id));
  for (const node of index.nodes) {
    assert(node.parentId === null || ids.has(node.parentId));
    assert(node.sourcePaths.length <= 16);
    for (const path of [...node.docs, ...node.sourcePaths]) {
      assert(!path.startsWith('/') && !path.split('/').includes('..'));
      assert(read(`demo/${path === 'BUILD.bazel' ? 'BUILD.demo' : path}`).length > 0);
    }
    for (const edge of node.design.connections) assert(ids.has(edge.targetId));
  }
  assert(index.nodes.some((node) => node.design.connections.length));
});

test('shell entrypoints parse and initialization does not overwrite retained demo', () => {
  for (const name of ['entrypoint.sh', 'checks.sh', 'smoke.sh']) execFileSync('bash', ['-n', fileURLToPath(new URL(name, import.meta.url))]);
  assert.match(read('entrypoint.sh'), /\[\[ \$# == 0 && ! -e \/data\/demo \]\]/);
  assert.match(read('entrypoint.sh'), /rev-parse --verify HEAD/);
  assert.match(read('entrypoint.sh'), /trap cleanup EXIT/);
});

test('cleanup still removes its exact container after logs and stop failures', () => {
  const calls = [], evidence = [];
  assert.throws(() => disposeContainer('owned-id', (...args) => {
    calls.push(args);
    if (args[0] !== 'rm') throw new Error(`Failed ${args[0]}`);
    return '';
  }, (name) => evidence.push(name)), /Failed stop/);
  assert.deepEqual(calls, [['logs', 'owned-id'], ['stop', '--time', '10', 'owned-id'], ['rm', '--force', 'owned-id']]);
  assert(evidence.includes('cleanup.txt'));
  const smoke = read('smoke.mjs');
  assert.match(smoke, /ownedId = docker\('create'/);
  assert.match(smoke, /docker\('start', ownedId\)/);
});

test('cleanup does not report success when removal fails', () => {
  const evidence = [];
  assert.throws(() => disposeContainer('owned-id', (...args) => {
    if (args[0] === 'rm') throw new Error('removal failed');
    return '';
  }, (name) => evidence.push(name)), /removal failed/);
  assert(!evidence.includes('cleanup.txt'));
});

test('full evidence storage cannot prevent owned process cleanup', () => {
  const calls = [];
  assert.throws(() => disposeContainer('owned-id', (...args) => {
    calls.push(args); return '';
  }, () => { throw new Error('ENOSPC'); }), /ENOSPC/);
  assert.deepEqual(calls, [['logs', 'owned-id'], ['stop', '--time', '10', 'owned-id'], ['rm', '--force', 'owned-id']]);
});
