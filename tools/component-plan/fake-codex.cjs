#!/usr/bin/env node
// TEST ONLY controlled provider. It cannot call a model.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = fs.realpathSync(process.cwd()), evidence = process.env.SWARM_PLAN_UI_EVIDENCE;
const log = value => fs.appendFileSync(path.join(evidence, 'wire.jsonl'), JSON.stringify(value) + '\n');
log({ event: 'start', root });
assert.deepEqual(process.argv.slice(2), ['app-server', '--listen', 'stdio://']);
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const reply = (id, result) => send({ id, result });
let turns = 0;
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  try {
    const m = JSON.parse(line); log(m);
    if (m.method === 'initialize') return reply(m.id, { userAgent: 'controlled-plan-proof' });
    if (m.method === 'initialized') return;
    if (m.method === 'thread/start') { assert.deepEqual(m.params, { cwd: root }); return reply(m.id, { cwd: root, thread: { id: 'plan-thread' } }); }
    if (m.method === 'turn/start') {
      assert.equal(++turns, 1); assert.equal(m.params.model, 'gpt-5.6-sol'); assert.equal(m.params.effort, 'xhigh');
      assert(m.params.input[0].text.includes('Write the index LAST'));
      reply(m.id, { turn: { id: 'plan-turn' } });
      send({ method: 'turn/started', params: { threadId: 'plan-thread', turn: { id: 'plan-turn', status: 'inProgress' } } });
      send({ method: 'item/agentMessage/delta', params: { threadId: 'plan-thread', turnId: 'plan-turn', itemId: 'output', delta: 'Controlled provider: inspecting the owned source.\n' } });
      setTimeout(() => {
        fs.mkdirSync(path.join(root, 'docs/design'), { recursive: true }); fs.mkdirSync(path.join(root, '.swarm'));
        fs.writeFileSync(path.join(root, 'docs/design/system.md'), '# Proof system\n\nThis controlled design maps proof.ts.\n', { flag: 'wx' });
        const node = { id: 'system', kind: 'component', title: 'Proof system', parentId: null, docs: ['docs/design/system.md'], sourcePaths: ['proof.ts'], taskIds: [], contextRefs: [], design: { summary: 'Controlled source map', state: 'implemented', constraints: [], connections: [], buildTargets: [] } };
        fs.writeFileSync(path.join(root, '.swarm/plans.json'), JSON.stringify({ version: 1, nodes: [node] }), { flag: 'wx' });
        send({ method: 'item/agentMessage/delta', params: { threadId: 'plan-thread', turnId: 'plan-turn', itemId: 'output', delta: 'Created docs/design/system.md and .swarm/plans.json.\n' } });
        send({ method: 'turn/completed', params: { threadId: 'plan-thread', turn: { id: 'plan-turn', status: 'completed' } } });
      }, 1800);
      return;
    }
    throw new Error(`Unexpected method ${m.method}`);
  } catch (error) { log({ event: 'failure', error: error.message }); process.exit(1); }
});
