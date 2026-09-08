#!/usr/bin/env node
// TEST ONLY: bounded deterministic app-server peer. Never invokes an installed agent or a model.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const root = fs.realpathSync(process.cwd());
const fixture = JSON.parse(fs.readFileSync(path.join(root, '.proof-fixture.json'), 'utf8'));
assert.equal(root, fixture.root);
assert.deepEqual(process.argv.slice(2), ['app-server', '--listen', 'stdio://']);
let role;
for (const candidate of ['A', 'B']) {
  try { fs.closeSync(fs.openSync(path.join(fixture.evidence, 'provider-' + candidate + '.claim'), 'wx', 0o600)); role = candidate; break; }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
assert(role, 'At most two provider processes; replay is forbidden');
const log = path.join(fixture.evidence, 'provider-wire.jsonl');
const record = value => fs.appendFileSync(log, JSON.stringify({ role, pid: process.pid, ...value }) + '\n');
record({ event: 'start', cwd: root, args: process.argv.slice(2) });
process.once('exit', code => record({ event: 'exit', code }));
process.once('SIGTERM', () => process.exit(0));
const send = value => { record({ event: 'out', value }); process.stdout.write(JSON.stringify(value) + '\n'); };
const reply = (id, result) => send({ id, result });
const notify = (method, params) => send({ method, params });
const threadId = 'joined-thread-' + role;
let turns = 0, turnId;
const complete = status => notify('turn/completed', { threadId, turn: { id: turnId, status } });
const input = readline.createInterface({ input: process.stdin });
input.on('line', line => {
  try {
    assert(line.length < 256 * 1024);
    const message = JSON.parse(line); record({event:'in', ...message});
    const p = message.params;
    if (message.method === 'initialize') { reply(message.id, { userAgent:'joined-deterministic-proof/1' }); return; }
    if (message.method === 'initialized') return;
    if (message.method === 'thread/start') {
      assert.deepEqual(Object.keys(p).sort(), ['cwd']); assert.equal(p.cwd, root);
      reply(message.id, { cwd:root, thread:{id:threadId} }); return;
    }
    assert.equal(p.threadId, threadId);
    if (message.method === 'turn/start') {
      assert.deepEqual(Object.keys(p).sort(), ['input', 'threadId']);
      assert(++turns <= (role === 'A' ? 1 : 2), 'At most three turns across A/B');
      assert.equal(p.input.length, 1); assert.equal(p.input[0].type, 'text');
      if (turns === 1) {
        const prompt = JSON.parse(p.input[0].text);
        assert.equal(prompt.instructions, 'Joined service proof: preserve this independent agent draft.');
        assert.equal(prompt.profile, 'trusted-local'); assert.equal(prompt.workspace, root);
        assert(prompt.attachments.some(a => a.path === 'proof.ts' && a.content === fixture.sourceText));
        assert(!p.input[0].text.includes('unsaved proof buffer'));
      } else { assert.equal(role, 'B'); assert.equal(p.input[0].text, 'B only next turn'); }
      turnId = 'joined-turn-' + role + '-' + turns;
      reply(message.id, {turn:{id:turnId}});
      notify('turn/started', {threadId, turn:{id:turnId, status:'inProgress'}});
      notify('item/agentMessage/delta', {threadId, turnId, itemId:'answer-' + turns, delta:'Deterministic ' + role + ' turn ' + turns + '\n'});
      const item = {id:'command-' + turns, type:'commandExecution', commandActions:[{type:'read'}], status:'inProgress'};
      notify('item/started', {threadId, turnId, item});
      notify('item/completed', {threadId, turnId, item:{...item, status:'completed', exitCode:0}});
      if (role === 'B' && turns === 1) complete('completed');
      return;
    }
    if (message.method === 'turn/interrupt') {
      assert.equal(p.turnId, turnId); reply(message.id, {}); complete('interrupted'); return;
    }
    throw new Error('Unexpected method ' + message.method);
  } catch (error) { record({event:'failure', error:error.message}); process.exitCode=1; input.close(); process.stdin.destroy(); }
});
input.on('close', () => process.exit(process.exitCode ?? 0));

