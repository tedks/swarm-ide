#!/usr/bin/env node
// TEST ONLY: two deterministic protocol peers, never an installed agent/model.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const root = fs.realpathSync(process.cwd());
const fixture = JSON.parse(fs.readFileSync(path.join(root, '.proof-fixture.json'), 'utf8'));
assert.equal(root, fixture.root);
assert.deepEqual(process.argv.slice(2), ['app-server', '--listen', 'stdio://']);
let role;
for (const candidate of ['parent', 'child']) {
  try { fs.closeSync(fs.openSync(path.join(fixture.evidence, 'provider-' + candidate + '.claim'), 'wx', 0o600)); role = candidate; break; }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
assert(role, 'At most two deterministic providers; replay is forbidden');
const log = path.join(fixture.evidence, 'provider-wire.jsonl');
const record = value => fs.appendFileSync(log, JSON.stringify({ role, pid: process.pid, ...value }) + '\n');
record({ event: 'start', cwd: root, args: process.argv.slice(2), namespace: fs.readlinkSync('/proc/self/ns/pid') });
process.once('exit', code => record({ event: 'exit', code }));
process.once('SIGTERM', () => process.exit(0));
const send = value => { record({ event: 'out', value }); process.stdout.write(JSON.stringify(value) + '\n'); };
const reply = (id, result) => send({ id, result });
const notify = (method, params) => send({ method, params });
const threadId = 'fork-gui-thread-' + role;
const turnId = 'fork-gui-turn-' + role;
let initialized = false, connected = false, conversation = false, goalCleared = false, goalRead = false, turned = false;
const input = readline.createInterface({ input: process.stdin });
input.on('line', line => {
  try {
    assert(line.length < 256 * 1024);
    const message = JSON.parse(line); record({ event: 'in', ...message });
    const p = message.params;
    if (message.method === 'initialize') {
      assert(!initialized); initialized = true;
      assert.deepEqual(p, { clientInfo: { name: 'swarm_ide', version: '0.1.0' },
        ...(role === 'child' ? { capabilities: { experimentalApi: true } } : {}) });
      reply(message.id, { userAgent: 'fork-gui-deterministic-proof/1' }); return;
    }
    assert(initialized);
    if (message.method === 'initialized') { assert(!connected); assert.deepEqual(p, {}); connected = true; return; }
    assert(connected);
    if (message.method === 'thread/start') {
      assert.equal(role, 'parent'); assert(!conversation); conversation = true;
      assert.deepEqual(p, { cwd: root });
      reply(message.id, { cwd: root, thread: { id: threadId, cwd: root, forkedFromId: null } }); return;
    }
    if (message.method === 'thread/fork') {
      assert.equal(role, 'child'); assert(!conversation); conversation = true;
      assert.deepEqual(p, { threadId: 'fork-gui-thread-parent', lastTurnId: 'fork-gui-turn-parent', cwd: root,
        excludeTurns: true, deferGoalContinuation: true, ephemeral: false });
      const wire = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
      assert(wire.some(row => row.role === 'parent' && row.event === 'out' && row.value.method === 'turn/completed' &&
        row.value.params.turn.id === 'fork-gui-turn-parent' && row.value.params.turn.status === 'completed'));
      reply(message.id, { cwd: root, thread: { id: threadId, cwd: root, forkedFromId: 'fork-gui-thread-parent' } }); return;
    }
    assert(conversation); assert.equal(p.threadId, threadId);
    if (message.method === 'thread/goal/clear') {
      assert.equal(role, 'child'); assert(!goalCleared && !goalRead && !turned); assert.deepEqual(p, { threadId });
      goalCleared = true; reply(message.id, { cleared: false }); return;
    }
    if (message.method === 'thread/goal/get') {
      assert.equal(role, 'child'); assert(goalCleared && !goalRead && !turned); assert.deepEqual(p, { threadId });
      goalRead = true; reply(message.id, { goal: null }); return;
    }
    if (message.method === 'turn/start') {
      assert(!turned, 'Exactly one turn per peer'); turned = true;
      assert.deepEqual(Object.keys(p).sort(), ['input', 'threadId']);
      assert.equal(p.input.length, 1); assert.equal(p.input[0].type, 'text');
      const prompt = JSON.parse(p.input[0].text);
      assert.equal(prompt.workspace, root);
      assert(!p.input[0].text.includes('unsaved fork proof buffer'));
      if (role === 'parent') {
        assert.equal(prompt.instructions, 'Fork GUI proof: preserve this independent agent draft.');
        assert.equal(prompt.profile, 'trusted-local');
        assert(prompt.attachments.some(a => a.path === 'proof.ts' && a.content === fixture.sourceText));
      } else {
        assert(goalCleared && goalRead);
        assert.equal(prompt.profile, 'trusted-local-child');
        assert.equal(prompt.instructions, 'Fork GUI proof child: inherit this completed conversation; do not modify files.');
        assert.equal(prompt.attachments, undefined);
      }
      reply(message.id, { turn: { id: turnId } });
      notify('turn/started', { threadId, turn: { id: turnId, status: 'inProgress' } });
      notify('item/agentMessage/delta', { threadId, turnId, itemId: 'answer', delta: 'Deterministic fork ' + role + ' ready\n' });
      notify('turn/completed', { threadId, turn: { id: turnId, status: 'completed' } });
      return;
    }
    throw new Error('Unexpected provider method ' + message.method);
  } catch (error) { record({ event: 'failure', error: error.message }); process.exitCode = 1; input.close(); process.stdin.destroy(); }
});
input.on('close', () => process.exit(process.exitCode ?? 0));
