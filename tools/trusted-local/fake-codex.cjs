#!/usr/bin/env node
// TEST ONLY: deterministic protocol peer, never forwards to an installed Codex.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const root = fs.realpathSync(process.cwd());
const fixture = JSON.parse(fs.readFileSync(path.join(root, '.proof-fixture.json'), 'utf8'));
assert.equal(root, fixture.root);
assert.deepEqual(process.argv.slice(2), ['app-server', '--listen', 'stdio://']);
const log = path.join(root, '.proof-wire.jsonl');
const record = (value) => fs.appendFileSync(log, JSON.stringify(value) + '\n');
record({ event: 'start', cwd: root, args: process.argv.slice(2) });
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const reply = (id, result) => send({ id, result });
const notify = (method, params) => send({ method, params });
const threadId = 'proof-thread';
let turns = 0, turnId;
function complete(status) { notify('turn/completed', { threadId, turn: { id: turnId, status } }); }
const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  try {
    assert(line.length < 256 * 1024);
    const message = JSON.parse(line); record(message);
    if (!message.method) {
      assert.equal(message.id, 'proof-approval'); assert.deepEqual(message.result, { decision: 'accept' });
      notify('item/agentMessage/delta', { threadId, turnId, itemId: 'answer-1', delta: '\nApproval received exactly once.\n' });
      complete('completed'); return;
    }
    const p = message.params;
    if (message.method === 'initialize') { reply(message.id, { userAgent: 'deterministic-proof/1' }); return; }
    if (message.method === 'initialized') return;
    if (message.method === 'thread/start') {
      // Exact key sets reject hidden approval/sandbox/config overrides.
      assert.deepEqual(Object.keys(p).sort(), ['cwd']); assert.equal(p.cwd, root);
      reply(message.id, { cwd: root, thread: { id: threadId } }); return;
    }
    assert.equal(p.threadId, threadId);
    if (message.method === 'turn/start') {
      assert.deepEqual(Object.keys(p).sort(), ['input', 'threadId']);
      assert(++turns <= 2); turnId = `proof-turn-${turns}`;
      assert(Array.isArray(p.input) && p.input[0].type === 'text');
      if (turns === 1) { assert(p.input[0].text.includes('proof.ts')); assert(!p.input[0].text.includes('unsaved proof buffer')); }
      else assert(p.input[0].text.includes('Second deterministic message'));
      reply(message.id, { turn: { id: turnId } });
      notify('turn/started', { threadId, turn: { id: turnId, status: 'inProgress' } });
      notify('item/agentMessage/delta', { threadId, turnId, itemId: `answer-${turns}`, delta: turns === 1 ? 'Deterministic local output.\n' : 'Second turn stays active for Stop.\n' });
      if (turns === 1) send({ id: 'proof-approval', method: 'item/commandExecution/requestApproval', params: { threadId, turnId, itemId: 'command-1', cwd: root, command: 'printf proof-only', reason: 'Protocol proof; no command is executed.', availableDecisions: ['accept', 'decline'] } });
      return;
    }
    if (message.method === 'turn/steer') { assert.equal(p.expectedTurnId, turnId); reply(message.id, { turnId }); return; }
    if (message.method === 'turn/interrupt') { assert.equal(p.turnId, turnId); reply(message.id, {}); complete('interrupted'); return; }
    throw new Error(`Unexpected method ${message.method}`);
  } catch (error) { record({ event: 'failure', error: error.message }); process.exitCode = 1; input.close(); process.stdin.destroy(); }
});
