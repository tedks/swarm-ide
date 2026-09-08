#!/usr/bin/env node
// A local observer, never the execution owner of the sessions it watches.
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
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
  const persist = () => jsonSave(stateFile, state);
  const notify = async (key, thread, message) => {
    if (state.notifications[key]) {
      if (state.notifications[key] !== 'sent') throw new Error(`Notification ${key} needs manual reconciliation; not resent`);
      return;
    }
    state.notifications[key] = 'pending'; await persist();
    try {
      await execute(config.codexCommand, ['queue', '--thread', thread, '--message', message], config.commandSeconds, signal);
      state.notifications[key] = 'sent'; await persist();
    } catch (e) {
      state.notifications[key] = 'unconfirmed'; await persist(); throw e;
    }
  };
  try {
    const prior = await textFile(stateFile);
    state = prior ? JSON.parse(prior) : { config, notifications: {}, roles: {}, tick: 0 };
    if (JSON.stringify(state.config) !== JSON.stringify(config)) throw new Error('State belongs to different config; use a new stateDirectory');
    for (const role of config.roles) {
      await mkdir(role.stepDirectory, { recursive: true, mode: 0o700 });
      const result = state.roles[role.name];
      if (result?.done) continue;
      active.set(role.name, { role, proof: {}, reader: new Records(), started: Date.now(), ...result });
    }
    if (Object.values(state.notifications).some((value) => value !== 'sent')) throw new Error('Unconfirmed prior notification; inspect state.json and parent queue before restarting');
    operational = true;
    let nextStatus = Date.now() + config.statusSeconds * 1000;
    let checkpoint = null;
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
              entry.assignment = assignment.replace(/\n+$/, '');
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
            }
            const p = entry.proof;
            if (typeof p.id === 'string' && p.id !== config.parentSession && p.parent === config.parentSession && p.model === config.model && p.compacted && p.exactTask) {
              entry.ready = Date.now();
              await jsonSave(step('ready'), p);
              await notify(`${name}:startup`, config.parentSession, `STARTUP VERIFIED — ${name} (${role.window}) consumed its exact assignment after compaction as ${config.model}. Read ${step('ready')}. Startup is not completion.`);
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
              await notify(`${name}:complete`, config.parentSession, `SUPERVISOR WAKE — ${name} completed. Read ${step('final-recap')} and verification.md. Intake the existing worker; do not duplicate it.`);
              state.roles[name] = { done: true, outcome: 'complete' }; await persist(); active.delete(name);
            } else if (entry.watcherError) {
              await save(step('watcher-error'), `${entry.watcherError}\n`);
              await notify(`${name}:watcher`, config.parentSession, `SUPERVISOR WAKE — ${name} external watcher failed. Read ${step('watcher-error')}. Built-in JSONL tracking continues; do not duplicate the worker.`);
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
      if (config.statusSeconds && active.size && Date.now() >= nextStatus && !checkpoint) {
        const tick = ++state.tick; await persist();
        for (const [name, entry] of active) {
          if (!entry.ready) continue;
          await notify(`${name}:status:${tick}`, entry.proof.id, `CTO CHECKPOINT ${tick} — Write ${path.join(entry.role.stepDirectory, `status-${tick}.md`)} with five short lines:\n1. Done and visible proof.\n2. Next bounded deliverable.\n3. Blocker or dependency.\n4. Scope growth or drift.\n5. PR and pushed commit.\nThen continue the existing assignment; no extra test/review cycle.`);
        }
        checkpoint = { tick, due: Date.now() + config.statusGraceSeconds * 1000 };
        nextStatus = Date.now() + config.statusSeconds * 1000;
      }
      if (checkpoint && Date.now() >= checkpoint.due) {
        await notify(`checkpoint:${checkpoint.tick}`, config.parentSession, `CTO CHECKPOINT ${checkpoint.tick} — Collect role/status-${checkpoint.tick}.md under the configured step directories (state: ${stateFile}). Responses may still be pending. Assess drift, steer only affected owners, and report to the user.`);
        checkpoint = null;
      }
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

async function main() {
  if (process.argv.length !== 3 || process.argv[2] === '--help') {
    console.log('Usage: bazel run //tools/supervisor:run -- /absolute/path/config.json');
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
