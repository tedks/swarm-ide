#!/usr/bin/env node
// A local observer, never the execution owner of the sessions it watches.
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { open, readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sleep = (ms, signal) => new Promise((resolve) => {
  if (signal?.aborted) return resolve();
  const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
  const timer = setTimeout(finish, ms);
  signal?.addEventListener('abort', finish, { once: true });
});
const textFile = async (file) => { try { return await readFile(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
const save = async (file, value) => {
  await writeFile(`${file}.pending`, value, { mode: 0o600 });
  await rename(`${file}.pending`, file);
};
const jsonSave = (file, value) => save(file, `${JSON.stringify(value, null, 2)}\n`);
const statusWritten = async (file) => {
  const text = await textFile(file);
  return !!text?.endsWith('\n') && text.trim().split(/\r?\n/).length >= 5;
};

export function configure(input, directory) {
  const required = (value, name) => {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error(`Invalid ${name}`);
    return value;
  };
  const command = (value, name) => {
    if (!Array.isArray(value) || !value.length) throw new Error(`Invalid ${name} argument array`);
    return value.map((arg) => required(arg, name));
  };
  const duration = (name, fallback, allowZero = false) => {
    const value = input[name] ?? fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) throw new Error(`Invalid ${name}`);
    return value;
  };
  if (!Array.isArray(input.roles) || !input.roles.length) throw new Error('At least one role required');
  const resolve = (value, name) => path.resolve(directory, required(value, name));
  const config = {
    parentSession: required(input.parentSession, 'parentSession'),
    generation: required(input.generation ?? 'initial', 'generation'),
    model: required(input.model ?? 'gpt-6-astra', 'model'),
    codexCommand: command(input.codexCommand, 'codexCommand'),
    watcherCommand: input.watcherCommand ? command(input.watcherCommand, 'watcherCommand') : null,
    stateDirectory: resolve(input.stateDirectory, 'stateDirectory'),
    startupSeconds: duration('startupSeconds', 1050), recapSeconds: duration('recapSeconds', 3000),
    pollSeconds: duration('pollSeconds', 0.25), commandSeconds: duration('commandSeconds', 30),
    statusSeconds: duration('statusSeconds', 0, true), statusGraceSeconds: duration('statusGraceSeconds', 45, true),
    roles: input.roles.map((role) => ({
      name: required(role.name, 'role.name'), window: required(role.window, 'role.window'),
      marker: required(role.marker, 'role.marker'), stepDirectory: resolve(role.stepDirectory, 'role.stepDirectory'),
    })),
  };
  for (const key of ['name', 'marker', 'stepDirectory']) {
    if (new Set(config.roles.map((role) => role[key])).size !== config.roles.length) throw new Error(`Duplicate role ${key}`);
  }
  if (config.roles.some((role) => !/^[a-zA-Z0-9_-]+$/.test(role.name))) throw new Error('Role names must be simple filenames');
  return config;
}

// Consume only complete records. Partial appends are read again next time.
export class Records {
  constructor(offset = 0) { this.offset = offset; this.identity = null; }
  async read(file) {
    let handle;
    try { handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new Error('Rollout must be a regular file');
      const identity = `${info.dev}:${info.ino}`;
      if ((this.identity && this.identity !== identity) || info.size < this.offset) throw new Error('Rollout replaced or truncated; start a new supervisor after checking its cursor');
      this.identity = identity;
      const buffer = Buffer.alloc(Math.min(info.size - this.offset, 4 * 1024 * 1024));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, this.offset);
      const chunk = buffer.subarray(0, bytesRead);
      const end = chunk.lastIndexOf(10);
      if (end < 0) {
        if (bytesRead === 4 * 1024 * 1024) throw new Error('Rollout record exceeds 4 MiB');
        return [];
      }
      this.offset += end + 1;
      return chunk.subarray(0, end).toString('utf8').split('\n').flatMap((line) => {
        try { const record = JSON.parse(line); return record && typeof record === 'object' ? [record] : []; } catch { return []; }
      });
    } finally { await handle.close(); }
  }
}

export function startupProof(proof, record, assignment) {
  const payload = record.payload;
  if (!payload || typeof payload !== 'object') return;
  if (record.type === 'session_meta' && !proof.id) {
    proof.id = payload.id; proof.parent = payload.forked_from_id;
  } else if (record.type === 'event_msg' && payload.type === 'task_started') {
    proof.turn = payload.turn_id; proof.model = null; proof.exactTask = false;
  } else if (record.type === 'turn_context' && typeof proof.turn === 'string' && payload.turn_id === proof.turn) {
    proof.model = payload.model;
  } else if (record.type === 'event_msg' && payload.type === 'context_compacted') {
    proof.compacted = true; proof.exactTask = false; proof.turn = null; proof.model = null;
  } else if (record.type === 'event_msg' && payload.type === 'user_message' && proof.compacted && proof.turn && payload.message === assignment) {
    proof.exactTask = true;
  }
}

export function finalMessage(record, marker) {
  const p = record.payload;
  if (record.type !== 'response_item' || p?.type !== 'message' || p.role !== 'assistant' || p.phase !== 'final_answer' || !Array.isArray(p.content)) return null;
  const text = p.content.filter((part) => part?.type === 'output_text' && typeof part.text === 'string').map((part) => part.text).join('');
  return text.startsWith(marker) ? text : null;
}

// No shell, inherited stdin, or observed-session signalling. Only this process's
// queue/watcher children are stopped on timeout/abort, and close is awaited.
export function execute(command, args, seconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Supervisor stopped'));
    const child = spawn(command[0], [...command.slice(1), ...args], { stdio: 'ignore' });
    let failed = null; let killTimer;
    const stop = (message) => {
      if (failed) return;
      failed = new Error(message); child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 200);
    };
    const abort = () => stop('Supervisor stopped');
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop('Command timed out; delivery may be ambiguous'), seconds * 1000);
    child.on('error', (error) => { failed = error; });
    child.on('close', (code) => {
      clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort);
      if (failed || code !== 0) reject(failed ?? new Error(`Command exited ${code}`)); else resolve();
    });
  });
}

export async function supervise(config, signal = new AbortController().signal) {
  await mkdir(config.stateDirectory, { recursive: true, mode: 0o700 });
  const lockPath = path.join(config.stateDirectory, 'supervisor.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  await lock.writeFile(`${process.pid}\n`);
  const stateFile = path.join(config.stateDirectory, 'state.json');
  let state; let failed = false; let operational = false;
  const active = new Map();
  const hasActiveRequest = () => [...active].some(([name, entry]) => entry.ready && (
    state.requests[name] || Object.values(state.requests).some((request) => request.child === entry.proof.id)
  ));
  const currentFile = path.join(config.stateDirectory, 'current.json');
  const persist = async () => {
    await jsonSave(stateFile, state);
    await jsonSave(currentFile, {
      generation: config.generation, instance: state.instance, updatedAt: new Date().toISOString(), tick: state.tick,
      pendingCheckpoint: state.checkpointWake ?? null,
      roles: config.roles.map((role) => ({
        name: role.name, marker: role.marker, stepDirectory: role.stepDirectory,
        outcome: state.roles[role.name]?.outcome ?? 'tracking',
        status: state.requests?.[role.name] ?? null,
      })),
    });
  };
  const queued = (value) => value === 'queued' || value === 'sent'; // legacy: sent meant only CLI success
  const notify = async (key, thread, message) => {
    if (state.notifications[key]) {
      if (!queued(state.notifications[key])) throw new Error(`Notification ${key} needs manual reconciliation; not resent`);
      return;
    }
    state.notifications[key] = 'pending';
    state.delivery[key] = { attemptedAt: new Date().toISOString() }; await persist();
    try {
      await execute(config.codexCommand, ['queue', '--thread', thread, '--message', message], config.commandSeconds, signal);
      state.notifications[key] = 'queued';
      state.delivery[key].queuedAt = new Date().toISOString(); await persist();
    } catch (e) {
      state.notifications[key] = 'unconfirmed'; await persist(); throw e;
    }
  };
  try {
    const prior = await textFile(stateFile);
    state = prior ? JSON.parse(prior) : { config, notifications: {}, roles: {}, tick: 0 };
    if (JSON.stringify(configure(state.config, config.stateDirectory)) !== JSON.stringify(config)) throw new Error('State belongs to different config/generation; use a new stateDirectory');
    state.config = config;
    const legacy = !state.instance;
    state.instance ??= randomUUID(); state.requests ??= {}; state.delivery ??= {};
    if (legacy && prior) {
      // Old "sent" receipts cannot tell us whether requests were consumed.
      // Preserve them as outstanding instead of enqueueing fresh duplicates.
      for (const role of config.roles) {
        const prefix = `${role.name}:status:`;
        const paths = Object.keys(state.notifications).filter((key) => key.startsWith(prefix) && /^\d+$/.test(key.slice(prefix.length)))
          .map((key) => path.join(role.stepDirectory, `status-${key.slice(prefix.length)}.md`));
        if (paths.length) state.requests[role.name] = { phase: 'waiting', legacyResponsePaths: paths };
      }
      if (Object.keys(state.notifications).some((key) => /^checkpoint:\d+$/.test(key))) {
        state.checkpointWake = { token: `${state.instance}:legacy`, generation: config.generation, queuedAt: null, legacy: true };
      }
    }
    for (const role of config.roles) {
      await mkdir(role.stepDirectory, { recursive: true, mode: 0o700 });
      const result = state.roles[role.name];
      if (result?.done) continue;
      active.set(role.name, { role, proof: {}, reader: new Records(), started: Date.now(), ...result });
    }
    if (Object.values(state.notifications).some((value) => !queued(value))) throw new Error('Unconfirmed prior notification; inspect state.json and parent queue before restarting');
    operational = true;
    await persist();
    let nextStatus = Date.now() + config.statusSeconds * 1000;
    while (active.size && !signal.aborted) {
      for (const [name, entry] of active) {
        const { role } = entry;
        const step = (file) => path.join(role.stepDirectory, file);
        try {
          if (!entry.rollout) {
            const rollout = await textFile(step('rollout-path'));
            const cursor = await textFile(step('recap-cursor'));
            const startCursor = await textFile(step('startup-cursor'));
            const assignment = await textFile(step('task-prompt'));
            if (rollout?.trim() && cursor !== null && startCursor !== null && assignment !== null) {
              if (!/^\d+\s*$/.test(cursor) || !Number.isSafeInteger(Number(cursor))) throw new Error('Invalid recap-cursor');
              if (!/^\d+\s*$/.test(startCursor) || !Number.isSafeInteger(Number(startCursor)) || Number(startCursor) > Number(cursor)) throw new Error('Invalid startup-cursor');
              entry.rollout = path.resolve(role.stepDirectory, rollout.trim());
              entry.recapReader = new Records(Number(cursor));
              entry.startReader = new Records(Number(startCursor));
              // The queue preserves task-prompt text, including final newlines.
              entry.assignment = assignment;
            }
          }
          if (entry.rollout && !entry.ready) {
            // Identity is the first session header; all behavioral evidence must
            // occur after the launcher's pre-compaction cursor, not in ancestry.
            if (!entry.proof.id) {
              const records = await entry.reader.read(entry.rollout);
              if (records.length) {
                if (records[0].type !== 'session_meta') throw new Error('Missing initial session identity');
                startupProof(entry.proof, records[0], entry.assignment);
              }
            }
            for (const record of await entry.startReader.read(entry.rollout)) {
              if (record.type !== 'session_meta') startupProof(entry.proof, record, entry.assignment);
              const p = entry.proof;
              if (!entry.verifiedProof && typeof p.id === 'string' && p.id !== config.parentSession && p.parent === config.parentSession && p.model === config.model && p.compacted && p.exactTask) {
                // Catch-up may include later steering turns. Preserve the exact
                // successful startup turn instead of inspecting only the tail.
                entry.verifiedProof = structuredClone(p);
              }
            }
            if (entry.verifiedProof) {
              entry.proof = entry.verifiedProof;
              entry.ready = Date.now();
              await jsonSave(step('ready'), entry.proof);
              await notify(`${name}:startup`, config.parentSession, `STARTUP VERIFIED — ${name} (${role.window}), generation ${config.generation}. Current state: ${currentFile}; proof: ${step('ready')}.`);
              if (config.watcherCommand) {
                entry.watcherAbort = new AbortController();
                // Compatibility accelerator only: the structured reader remains
                // authoritative even if the optional external watcher fails.
                entry.watcher = execute(config.watcherCommand, ['recap', entry.rollout, role.marker, String(config.recapSeconds), '--after-byte', String(entry.recapReader.offset)], config.recapSeconds + 1, entry.watcherAbort.signal)
                  .catch((error) => { entry.watcherError = error.message; });
              }
            }
          }
          if (entry.ready) {
            let recap;
            for (const record of await entry.recapReader.read(entry.rollout)) recap ??= finalMessage(record, role.marker);
            if (recap) {
              await save(step('final-recap'), `${recap}\n`);
              // Completing work does not consume an already queued status ask.
              // Keep that request outstanding even when another role uses the
              // same child, until its actual response receipt arrives.
              await notify(`${name}:complete`, config.parentSession, `SUPERVISOR WAKE — ${name} completed. Generation ${config.generation}; current state: ${currentFile}; recap: ${step('final-recap')}.`);
              state.roles[name] = { done: true, outcome: 'complete' }; await persist(); active.delete(name);
            } else if (entry.watcherError) {
              await save(step('watcher-error'), `${entry.watcherError}\n`);
              await notify(`${name}:watcher`, config.parentSession, `SUPERVISOR WAKE — ${name} external watcher failed. Generation ${config.generation}; current state: ${currentFile}; error: ${step('watcher-error')}. Built-in tracking continues.`);
              entry.watcherError = null;
            }
          }
          if (active.has(name) && Date.now() - (entry.ready ?? entry.started) > (entry.ready ? config.recapSeconds : config.startupSeconds) * 1000) throw new Error(entry.ready ? 'Recap deadline elapsed' : 'Startup proof deadline elapsed');
        } catch (error) {
          if (signal.aborted) break;
          failed = true;
          await save(step('push-status'), `tracking-failed: ${error.message}\n`);
          try { await notify(`${name}:failure`, config.parentSession, `SUPERVISOR WAKE — ${name} tracking failed: ${error.message}. Inspect ${step('push-status')} and existing ${role.window}; do not duplicate the worker.`); }
          catch (deliveryError) { await save(step('push-status'), `notification-unconfirmed: ${deliveryError.message}\n`); }
          state.roles[name] = { done: true, outcome: 'failed' }; await persist(); active.delete(name);
        }
        if (!active.has(name) && entry.watcher) { entry.watcherAbort.abort(); await entry.watcher; }
      }
      // A response receipt, not CLI success or elapsed time, frees the child
      // status slot. UUID-scoped filenames cannot acknowledge an older step.
      for (const request of Object.values(state.requests)) {
        const paths = request?.legacyResponsePaths ?? (request?.responsePath ? [request.responsePath] : []);
        if (request?.phase === 'waiting' && paths.length && (await Promise.all(paths.map(statusWritten))).every(Boolean)) {
          request.phase = 'answered'; request.answeredAt = new Date().toISOString(); await persist();
        }
      }
      if (state.checkpointWake && await textFile(path.join(config.stateDirectory, 'checkpoint-ack')) === `${state.checkpointWake.token}\n`) {
        state.checkpointWake = null; await persist();
      }
      if (config.statusSeconds && active.size && Date.now() >= nextStatus) {
        const tick = ++state.tick; await persist();
        for (const [name, entry] of active) {
          if (!entry.ready || state.requests[name]?.phase === 'waiting' || Object.values(state.requests).some((request) => request.phase === 'waiting' && (!request.child || request.child === entry.proof.id))) continue;
          const responsePath = path.join(entry.role.stepDirectory, `status-${state.instance}-${tick}.md`);
          state.requests[name] = { phase: 'waiting', child: entry.proof.id, tick, responsePath, requestedAt: new Date().toISOString() };
          state.checkpointDue ??= Date.now() + config.statusGraceSeconds * 1000;
          await persist();
          await notify(`${name}:status:${tick}`, entry.proof.id, `CTO CHECKPOINT ${tick}, generation ${config.generation} — Current assignment state: ${currentFile}. If still active, write ${responsePath} with five short lines:\n1. Done and visible proof.\n2. Next bounded deliverable.\n3. Blocker or dependency.\n4. Scope growth or drift.\n5. PR and pushed commit.\nNo new work or test/review cycle is requested.`);
        }
        if (hasActiveRequest()) state.checkpointDue ??= Date.now() + config.statusGraceSeconds * 1000;
        await persist();
        nextStatus = Date.now() + config.statusSeconds * 1000;
      }
      if (state.checkpointDue && Date.now() >= state.checkpointDue) {
        // Completion may overtake the grace period. Never queue a routine wake
        // with no active participant; genuine completion/error wakes are separate.
        if (active.size && !state.checkpointWake && hasActiveRequest()) {
          const token = `${state.instance}:${state.tick}`;
          state.checkpointWake = { token, generation: config.generation, queuedAt: null };
          await notify(`checkpoint:${state.tick}`, config.parentSession, `CTO CHECKPOINT — Current generation ${config.generation}: ${currentFile}. Acknowledge routine wake token ${token} after reading; unhandled completion/error notices remain separate.`);
          state.checkpointWake.queuedAt = new Date().toISOString();
        }
        state.checkpointDue = null; await persist();
      }
      if (!active.size) { state.checkpointDue = null; await persist(); }
      await sleep(config.pollSeconds * 1000, signal);
    }
    return failed || Object.values(state.roles).some((role) => role.outcome === 'failed') ? 1 : signal.aborted ? 130 : 0;
  } catch (error) {
    if (!signal.aborted && operational) {
      await save(path.join(config.stateDirectory, 'failure'), `${error.message}\n`);
      // Status transport failures must not disappear as a bare process exit.
      // Do not retry an ambiguous prior message; this is a distinct failure wake.
      try { await notify('supervisor:failure', config.parentSession, `SUPERVISOR WAKE — supervisor tracking stopped: ${error.message}. Inspect ${stateFile}; existing workers remain alive.`); } catch { /* state.json retains unconfirmed delivery */ }
    }
    throw error;
  } finally {
    for (const entry of active.values()) { entry.watcherAbort?.abort(); await entry.watcher; }
    await lock.close(); await unlink(lockPath);
  }
}

// Explicit operator receipt for our own supersedable checkpoint only. This does
// not inspect, delete or acknowledge any Codex queue item or completion.
export async function acknowledgeStatus(directory, token) {
  const current = JSON.parse(await readFile(path.join(directory, 'current.json'), 'utf8'));
  if (typeof token !== 'string' || current.pendingCheckpoint?.token !== token) throw new Error('Checkpoint token is not current');
  await save(path.join(directory, 'checkpoint-ack'), `${token}\n`);
}

async function main() {
  if (process.argv[2] === 'ack-status' && process.argv.length === 5) {
    await acknowledgeStatus(path.resolve(process.argv[3]), process.argv[4]); return 0;
  }
  if (process.argv.length !== 3 || process.argv[2] === '--help') {
    console.log('Usage: bazel run //tools/supervisor:run -- /absolute/path/config.json');
    console.log('       bazel run //tools/supervisor:run -- ack-status /absolute/state-directory CURRENT-TOKEN');
    return process.argv[2] === '--help' ? 0 : 2;
  }
  const file = path.resolve(process.argv[2]);
  const config = configure(JSON.parse(await readFile(file, 'utf8')), path.dirname(file));
  const stop = new AbortController();
  process.once('SIGINT', () => stop.abort()); process.once('SIGTERM', () => stop.abort());
  return supervise(config, stop.signal);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
