import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, appendFile, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configure, Records, startupProof, finalMessage, supervise, acknowledgeStatus } from './supervisor.mjs';

const script = fileURLToPath(new URL('./supervisor.mjs', import.meta.url));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const line = (type, payload) => `${JSON.stringify({ type, payload })}\n`;
const message = (text, role = 'assistant', phase = 'final_answer') => ({ type: 'response_item', payload: { type: 'message', role, phase, content: [{ type: 'output_text', text }] } });
const marker = 'TEST-S7 COMPLETE — RECAP';
const startup = (parent = 'parent', model = 'gpt-6-astra', task = 'do task') =>
  line('session_meta', { id: 'child', forked_from_id: parent }) +
  line('event_msg', { type: 'context_compacted' }) +
  line('event_msg', { type: 'task_started', turn_id: 'task-turn' }) +
  line('turn_context', { model, turn_id: 'task-turn' }) +
  line('event_msg', { type: 'user_message', message: task });
async function fixture(t, options = {}) {
  const task = options.task ?? 'do task';
  const directory = await mkdtemp(path.join(os.tmpdir(), 'supervisor-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const step = path.join(directory, 'step with spaces;$(literal)');
  await mkdir(step);
  const rollout = path.join(step, 'rollout.jsonl');
  const calls = path.join(directory, 'calls.jsonl');
  const fake = path.join(directory, 'fake-cli.mjs');
  await writeFile(fake, `import {appendFileSync} from 'node:fs';\nappendFileSync(process.argv[2],JSON.stringify(process.argv.slice(3))+'\\n');\nprocess.exit(${options.exit ?? 0});\n`);
  await writeFile(rollout, options.rollout ?? startup('parent', 'gpt-6-astra', task));
  await writeFile(path.join(step, 'rollout-path'), `${rollout}\n`);
  await writeFile(path.join(step, 'recap-cursor'), '0\n');
  await writeFile(path.join(step, 'startup-cursor'), '0\n');
  await writeFile(path.join(step, 'task-prompt'), task);
  const config = configure({
    parentSession: 'parent', codexCommand: [process.execPath, fake, calls], stateDirectory: path.join(directory, 'state'),
    startupSeconds: 0.2, recapSeconds: 2, pollSeconds: 0.01, commandSeconds: 1,
    roles: [{ name: 'worker', window: 'session:worker;$(literal)', stepDirectory: step, marker }],
    ...options.config,
  }, directory);
  const messages = async () => { try { return (await readFile(calls, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } };
  return { directory, step, rollout, config, calls, messages };
}
async function waitUntil(predicate) {
  const deadline = Date.now() + 2500;
  while (!await predicate()) { if (Date.now() > deadline) throw new Error('Test condition timed out'); await pause(10); }
}
async function complete(f) { await appendFile(f.rollout, `${JSON.stringify(message(`${marker}\nImplemented result.`))}\n`); }

test('startup proof requires correct ordering and exact assignment; final predicate rejects lookalikes', () => {
  const proof = {};
  startupProof(proof, { type: 'event_msg', payload: { type: 'user_message', message: 'do task' } }, 'do task');
  assert.equal(proof.exactTask, undefined);
  for (const record of startup().trim().split('\n').map(JSON.parse)) startupProof(proof, record, 'do task');
  assert.equal(proof.exactTask, true);
  startupProof(proof, { type: 'event_msg', payload: { type: 'context_compacted' } }, 'do task');
  assert.equal(proof.exactTask, false);
  assert.equal(finalMessage(message(marker, 'user'), marker), null);
  assert.equal(finalMessage(message(marker, 'assistant', 'commentary'), marker), null);
  assert.equal(finalMessage(message(`prefix ${marker}`), marker), null);
  assert.equal(finalMessage(message(marker), marker), marker);
});

test('partial JSONL is retained until newline; malformed lines do not hide next record', async (t) => {
  const f = await fixture(t, { rollout: '' });
  const reader = new Records();
  await appendFile(f.rollout, '{"type":"one"');
  assert.deepEqual(await reader.read(f.rollout), []);
  await appendFile(f.rollout, '}\nmalformed\n{"type":"two"}\n');
  assert.deepEqual(await reader.read(f.rollout), [{ type: 'one' }, { type: 'two' }]);
  assert.deepEqual(await reader.read(f.rollout), []);
  await writeFile(f.rollout, '');
  await assert.rejects(reader.read(f.rollout), /truncated/);
});

test('real CLI over fake executable: complete recap exactly once, safe argv, restart silent', async (t) => {
  const f = await fixture(t);
  const configFile = path.join(f.directory, 'config.json');
  await writeFile(configFile, JSON.stringify(f.config));
  const child = spawn(process.execPath, [script, configFile], { stdio: 'pipe' });
  let stderr = ''; child.stderr.on('data', (chunk) => { stderr += chunk; });
  const result = new Promise((resolve) => child.on('close', resolve));
  await waitUntil(async () => (await f.messages()).length === 1);
  const raw = JSON.stringify(message(`${marker}\nFull result with ; $(unexpanded) text.`));
  await appendFile(f.rollout, raw);
  await pause(40);
  assert.equal((await f.messages()).length, 1);
  await appendFile(f.rollout, '\n');
  assert.equal(await result, 0, stderr);
  assert.equal((await f.messages()).length, 2);
  assert.match(await readFile(path.join(f.step, 'final-recap'), 'utf8'), /Full result/);
  assert.deepEqual((await f.messages())[0].slice(0, 4), ['queue', '--thread', 'parent', '--message']);
  assert.match((await f.messages())[0][4], /session:worker;\$\(literal\)/);
  assert.equal(await supervise(f.config), 0);
  assert.equal((await f.messages()).length, 2);
});

for (const [name, task] of [
  ['one final newline', 'do task\n'],
  ['multiple final newlines', 'do task\n\n'],
  ['CRLF ending', 'do task\r\n'],
  ['surrounding whitespace', ' \tdo task \t\n'],
]) {
  test(`exact task with ${name} creates ready and completion`, async (t) => {
    const f = await fixture(t, { task });
    await complete(f);
    assert.equal(await supervise(f.config), 0);
    const proof = JSON.parse(await readFile(path.join(f.step, 'ready'), 'utf8'));
    assert.equal(proof.exactTask, true);
    assert.equal(proof.turn, 'task-turn');
    const calls = await f.messages();
    assert.equal(calls.length, 2);
    assert.match(calls[0][4], /STARTUP VERIFIED/);
    assert.match(calls[1][4], /worker completed/);
  });
}

for (const [name, records, task = 'do task'] of [
  ['wrong ancestry', startup('other')], ['wrong model', startup('parent', 'wrong')],
  ['wrong task', startup('parent', 'gpt-6-astra', 'do other task')],
  ['missing final newline', startup(), 'do task\n'],
  ['extra final newline', startup('parent', 'gpt-6-astra', 'do task\n\n'), 'do task\n'],
  ['different line ending', startup('parent', 'gpt-6-astra', 'do task\n'), 'do task\r\n'],
  ['missing surrounding whitespace', startup(), ' \tdo task \t'],
  ['missing compaction', startup().split('\n').filter((row) => !row.includes('context_compacted')).join('\n')],
]) {
  test(`${name} never creates ready or completion; sends actual failure wake`, async (t) => {
    const f = await fixture(t, { task, rollout: records + JSON.stringify(message(marker)) + '\n' });
    assert.equal(await supervise(f.config), 1);
    await assert.rejects(access(path.join(f.step, 'ready')));
    const calls = await f.messages(); assert.equal(calls.length, 1);
    assert.match(calls[0][4], /tracking failed: Startup proof deadline/);
  });
}

test('old recap before cursor cannot complete new step', async (t) => {
  const records = startup() + JSON.stringify(message(marker)) + '\n';
  const f = await fixture(t, { rollout: records, config: { recapSeconds: 0.15 } });
  await writeFile(path.join(f.step, 'recap-cursor'), String(Buffer.byteLength(records)));
  assert.equal(await supervise(f.config), 1);
  await assert.rejects(access(path.join(f.step, 'final-recap')));
  assert.match((await f.messages()).at(-1)[4], /Recap deadline/);
});

test('inherited compaction before launch cursor cannot prove child compaction', async (t) => {
  const inherited = startup();
  const later = line('event_msg', { type: 'task_started', turn_id: 'new-turn' }) +
    line('turn_context', { turn_id: 'new-turn', model: 'gpt-6-astra' }) +
    line('event_msg', { type: 'user_message', message: 'do task' });
  const f = await fixture(t, { rollout: inherited + later });
  await writeFile(path.join(f.step, 'startup-cursor'), String(Buffer.byteLength(inherited)));
  await writeFile(path.join(f.step, 'recap-cursor'), String(Buffer.byteLength(inherited)));
  assert.equal(await supervise(f.config), 1);
  await assert.rejects(access(path.join(f.step, 'ready')));
});

test('split append cannot borrow prior model before current assignment context arrives', async (t) => {
  const prefix = line('session_meta', { id: 'child', forked_from_id: 'parent' }) +
    line('turn_context', { model: 'gpt-6-astra', turn_id: 'old' }) +
    line('event_msg', { type: 'context_compacted' }) +
    line('event_msg', { type: 'task_started', turn_id: 'new' }) +
    line('event_msg', { type: 'user_message', message: 'do task' });
  const f = await fixture(t, { rollout: prefix });
  const run = supervise(f.config);
  await pause(50);
  assert.equal((await f.messages()).length, 0);
  await appendFile(f.rollout, line('turn_context', { turn_id: 'new', model: 'wrong' }));
  assert.equal(await run, 1);
  await assert.rejects(access(path.join(f.step, 'ready')));
});

test('catching up after later steering retains the already verified assignment turn', async (t) => {
  const later = line('event_msg', { type: 'task_started', turn_id: 'steering-turn' }) +
    line('turn_context', { turn_id: 'steering-turn', model: 'gpt-6-astra' }) +
    line('event_msg', { type: 'user_message', message: 'Please continue' });
  const f = await fixture(t, { rollout: startup() + later + JSON.stringify(message(marker)) + '\n' });
  assert.equal(await supervise(f.config), 0);
  assert.equal(JSON.parse(await readFile(path.join(f.step, 'ready'), 'utf8')).turn, 'task-turn');
});

test('status command failure sends parent failure wake and releases own watcher before lock', async (t) => {
  const f = await fixture(t, { config: { statusSeconds: 0.05, statusGraceSeconds: 0 } });
  const fake = path.join(f.directory, 'status-fake.mjs');
  await writeFile(fake, `import {appendFileSync} from 'node:fs';\nappendFileSync(process.argv[2],JSON.stringify(process.argv.slice(3))+'\\n');\nprocess.exit(process.argv.includes('child')?8:0);\n`);
  f.config.codexCommand = [process.execPath, fake, f.calls];
  const watcher = path.join(f.directory, 'watcher.mjs');
  const watcherPid = path.join(f.directory, 'watcher.pid');
  await writeFile(watcher, `import {writeFileSync} from 'node:fs';writeFileSync(process.argv[2],String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},100);`);
  f.config.watcherCommand = [process.execPath, watcher, watcherPid];
  await assert.rejects(supervise(f.config), /Command exited 8/);
  assert.match((await f.messages()).at(-1)[4], /supervisor tracking stopped/);
  await assert.rejects(access(path.join(f.config.stateDirectory, 'supervisor.lock')));
  const pid = Number(await readFile(watcherPid, 'utf8'));
  assert.throws(() => process.kill(pid, 0), /ESRCH/);
});

test('failed optional watcher wakes parent but built-in reader still captures later completion', async (t) => {
  const f = await fixture(t, { config: { watcherCommand: [process.execPath, '-e', 'process.exit(7)', '--'] } });
  const run = supervise(f.config);
  await waitUntil(async () => (await f.messages()).length >= 2);
  assert.match((await f.messages())[1][4], /external watcher failed/);
  await complete(f);
  assert.equal(await run, 0);
  assert.equal((await f.messages()).filter((call) => call[4].includes('worker completed.')).length, 1);
});

test('failed queue is durable unconfirmed, never success or replayed after restart', async (t) => {
  const f = await fixture(t, { exit: 9 });
  assert.equal(await supervise(f.config), 1);
  const before = (await f.messages()).length;
  assert.match(await readFile(path.join(f.step, 'push-status'), 'utf8'), /notification-unconfirmed/);
  await assert.rejects(supervise(f.config), /Unconfirmed prior notification/);
  assert.equal((await f.messages()).length, before);
});

test('five-line status request goes to verified child then root, stops after completion', async (t) => {
  const f = await fixture(t, { config: { statusSeconds: 0.08, statusGraceSeconds: 0.03 } });
  const run = supervise(f.config);
  await waitUntil(async () => (await f.messages()).some((call) => call[2] === 'parent' && call[4].startsWith('CTO CHECKPOINT')));
  const status = (await f.messages()).find((call) => call[2] === 'child');
  assert.equal(status[4].split('\n').filter((row) => /^[1-5]\. /.test(row)).length, 5);
  await complete(f); assert.equal(await run, 0);
});

const stateOf = (f) => readFile(path.join(f.config.stateDirectory, 'state.json'), 'utf8').then(JSON.parse).catch((e) => { if (e.code === 'ENOENT') return {}; throw e; });
const currentOf = (f) => readFile(path.join(f.config.stateDirectory, 'current.json'), 'utf8').then(JSON.parse);
const childRequests = async (f) => (await f.messages()).filter((call) => call[2] === 'child');
const rootChecks = async (f) => (await f.messages()).filter((call) => call[2] === 'parent' && call[4].startsWith('CTO CHECKPOINT'));

test('backlogged child request and unacknowledged ROOT wake do not accumulate each tick', async (t) => {
  const f = await fixture(t, { config: { statusSeconds: 0.04, statusGraceSeconds: 0.01 } });
  const run = supervise(f.config);
  await waitUntil(async () => (await rootChecks(f)).length === 1);
  await pause(220);
  assert.equal((await childRequests(f)).length, 1);
  assert.equal((await rootChecks(f)).length, 1);
  assert.ok((await stateOf(f)).tick >= 3);
  await complete(f); assert.equal(await run, 0);
  assert.equal((await currentOf(f)).roles[0].outcome, 'complete');
  assert.equal((await f.messages()).filter((call) => call[4].includes('worker completed.')).length, 1);
});

test('response frees only child slot; explicit current receipt frees ROOT checkpoint slot', async (t) => {
  const f = await fixture(t, { config: { statusSeconds: 0.06, statusGraceSeconds: 0.01 } });
  const run = supervise(f.config);
  await waitUntil(async () => (await rootChecks(f)).length === 1);
  const old = await currentOf(f);
  await writeFile(old.roles[0].status.responsePath, 'Done\nNext\nBlocker\nScope\nPR\n');
  await waitUntil(async () => (await childRequests(f)).length === 2);
  assert.equal((await rootChecks(f)).length, 1);
  await acknowledgeStatus(f.config.stateDirectory, old.pendingCheckpoint.token);
  await waitUntil(async () => (await rootChecks(f)).length === 2);
  await assert.rejects(acknowledgeStatus(f.config.stateDirectory, old.pendingCheckpoint.token), /not current/);
  assert.equal((await childRequests(f)).length, 2);
  await complete(f); assert.equal(await run, 0);
});

test('completion overtakes status grace period without stale routine ROOT checkpoint', async (t) => {
  const f = await fixture(t, { config: { statusSeconds: 0.04, statusGraceSeconds: 0.4 } });
  const run = supervise(f.config);
  await waitUntil(async () => (await childRequests(f)).length === 1);
  await complete(f); assert.equal(await run, 0);
  assert.equal((await rootChecks(f)).length, 0);
  assert.equal((await childRequests(f)).length, 1);
  assert.equal((await stateOf(f)).checkpointDue, null);
});

test('restart retains pending status and ROOT wake, without re-enqueue or consumed claim', async (t) => {
  const f = await fixture(t, { config: { statusSeconds: 0.05, statusGraceSeconds: 0.01 } });
  const stop = new AbortController(); const first = supervise(f.config, stop.signal);
  await waitUntil(async () => (await stateOf(f)).checkpointWake?.queuedAt);
  stop.abort(); assert.equal(await first, 130);
  const before = (await f.messages()).length;
  const second = supervise(f.config);
  await pause(180);
  assert.equal((await f.messages()).length, before);
  const state = await stateOf(f);
  assert.ok(Object.values(state.notifications).every((value) => value === 'queued'));
  assert.ok(Object.values(state.delivery).every((value) => value.attemptedAt && value.queuedAt && !('consumedAt' in value)));
  await complete(f); assert.equal(await second, 0);
});

test('continuation generation cannot reuse ledger and never loses its own true completion', async (t) => {
  const f = await fixture(t);
  await complete(f); assert.equal(await supervise(f.config), 0);
  const changed = { ...f.config, generation: 'second-step' };
  await assert.rejects(supervise(changed), /different config\/generation/);
  const old = await currentOf(f);
  const secondStep = path.join(f.directory, 'continuation'); await mkdir(secondStep);
  const oldBytes = Buffer.byteLength(await readFile(f.rollout, 'utf8'));
  const newMarker = 'SECOND-STEP COMPLETE';
  await writeFile(path.join(secondStep, 'rollout-path'), f.rollout);
  await writeFile(path.join(secondStep, 'startup-cursor'), '0');
  await writeFile(path.join(secondStep, 'recap-cursor'), String(oldBytes));
  await writeFile(path.join(secondStep, 'task-prompt'), 'do second task');
  await appendFile(f.rollout, line('event_msg', { type: 'task_started', turn_id: 'second-turn' }) +
    line('turn_context', { model: 'gpt-6-astra', turn_id: 'second-turn' }) +
    line('event_msg', { type: 'user_message', message: 'do second task' }) +
    JSON.stringify(message(newMarker)) + '\n');
  const second = { ...changed, stateDirectory: path.join(f.directory, 'second-state'), roles: [{ ...f.config.roles[0], marker: newMarker, stepDirectory: secondStep }] };
  assert.equal(await supervise(second), 0);
  const current = JSON.parse(await readFile(path.join(second.stateDirectory, 'current.json'), 'utf8'));
  assert.notEqual(current.instance, old.instance);
  assert.equal(current.generation, 'second-step');
  assert.equal((await f.messages()).filter((call) => call[4].includes('worker completed.')).length, 2);
  assert.match(await readFile(path.join(secondStep, 'final-recap'), 'utf8'), /SECOND-STEP/);
});

test('exclusive supervisor lock and stopping observer leave rollout intact', async (t) => {
  const f = await fixture(t);
  const stop = new AbortController(); const run = supervise(f.config, stop.signal);
  await waitUntil(async () => (await f.messages()).length === 1);
  await assert.rejects(supervise(f.config), /EEXIST/);
  stop.abort(); assert.equal(await run, 130);
  assert.equal(await readFile(f.rollout, 'utf8'), startup());
  await assert.rejects(access(path.join(f.config.stateDirectory, 'supervisor.lock')));
});

test('invalid timing, duplicate identities, and shell-string commands rejected', () => {
  const base = { parentSession: 'p', stateDirectory: '/tmp/state', codexCommand: ['codex'], roles: [{ name: 'a', window: 'w', marker: 'm', stepDirectory: '/tmp/a' }] };
  assert.throws(() => configure({ ...base, codexCommand: 'codex --flag' }, '/tmp'), /argument array/);
  assert.throws(() => configure({ ...base, pollSeconds: Number.NaN }, '/tmp'), /Invalid pollSeconds/);
  assert.throws(() => configure({ ...base, roles: [...base.roles, ...base.roles] }, '/tmp'), /Duplicate/);
});
