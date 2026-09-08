import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

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
  assert.match(docker, /bazel build --jobs=3 \/\/:desktop-bundle/);
  assert.match(docker, /USER 1000:1000/);
  assert.match(entry, /dbus-run-session -- electron \/opt\/swarm\/app\/electron\/main\.js/);
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
  for (const name of ['**/.git', '**/node_modules', '**/artifacts', '**/*local-registry*', '**/work-log.json', '**/*.jsonl', '**/auth.json']) assert(ignore.split('\n').includes(name));
  assert(!ignore.split('\n').includes('!.swarm/**'));
});

test('sandbox profile stays deny-by-default and permits only documented namespace adjustment', () => {
  const profile = JSON.parse(read('seccomp.json'));
  assert.equal(profile.defaultAction, 'SCMP_ACT_ERRNO');
  assert.deepEqual(profile.syscalls[0].names, ['clone', 'setns', 'unshare']);
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
