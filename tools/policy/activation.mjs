// Imported ONLY by inner.mjs after the immediate independent boundary checks.
import { spawn } from 'node:child_process';
import { constants, existsSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { ENV, LIMIT } from './boundary.mjs';
import { activationEnvelope } from './activation-contract.mjs';

function readBounded(path, limit) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('OBSERVATION_NOT_FILE');
    const buffer = Buffer.alloc(limit + 1);
    let length = 0, amount;
    while (length < buffer.length && (amount = readSync(fd, buffer, length, buffer.length - length, null))) length += amount;
    if (length > limit) throw new Error('OBSERVATION_LIMIT');
    return buffer.subarray(0, length).toString('utf8');
  } finally { closeSync(fd); }
}

export async function activate(expected) {
  if (!['enabled', 'disabled', 'fails', 'missing'].includes(expected)) return { status: 'ACTIVATION_CASE_INVALID', observation: {} };
  const args = ['-c', 'sqlite_home="/state/sqlite"', '-c', 'log_dir="/state/logs"',
    '-c', 'otel.exporter="none"', '-c', 'otel.trace_exporter="none"', '-c', 'otel.metrics_exporter="none"',
    '-c', 'otel.log_user_prompt=false', '-c', 'analytics.enabled=false',
    'app-server', '--listen', 'stdio://', '--strict-config'];
  const server = spawn('/package/bin/codex', args, { env: ENV, cwd: '/work', stdio: ['pipe', 'pipe', 'pipe'] });
  let fault = null, bytes = 0, buffer = '', nextId = null, current = null, closing = false;
  let resolveClosed, resolveStartup;
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  const started = new Promise(resolve => { resolveStartup = resolve; });
  let generationObserved = false, thread = 'not-created', rejectionReason = null, threadId = null;
  const startup = [], startupThreads = [], requests = [], decoder = new StringDecoder('utf8');
  function fail(code) {
    fault ??= code; server.kill('SIGKILL');
    current?.reject(new Error(fault)); current = null;
    resolveClosed(false);
    resolveStartup(false);
  }
  server.on('error', () => fail('SERVER_START_FAILED'));
  server.on('exit', () => { if (!closing) fail('SERVER_EXITED'); });
  // `close`, unlike exit, also drains all observer stdout/stderr pipes.
  server.on('close', (code, signal) => resolveClosed(closing && code === 0 && signal === null && !fault));
  server.stdin.on('error', () => fail('SERVER_PIPE_FAILED'));
  server.stderr.on('data', chunk => {
    if ((bytes += chunk.length) > LIMIT) { fail('SERVER_OUTPUT_LIMIT'); return; }
  });
  server.stdout.on('data', chunk => {
    if ((bytes += chunk.length) > LIMIT) { fail('SERVER_OUTPUT_LIMIT'); return; }
    buffer += decoder.write(chunk);
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      let value; try { value = JSON.parse(line); } catch { fail('SERVER_INVALID_JSON'); return; }
      if (!value || typeof value !== 'object' || Array.isArray(value)) { fail('SERVER_INVALID_JSON'); return; }
      if (value.method && Object.hasOwn(value, 'id')) { fail('SERVER_UNEXPECTED_REQUEST'); return; }
      if (/^(turn\/(started|completed)|item\/agentMessage\/delta|codex\/event\/task_started)$/.test(value.method ?? '')) {
        generationObserved = true; fail('GENERATION_OBSERVED'); return;
      }
      if (value.method === 'mcpServer/startupStatus/updated' && value.params?.name === 'policy_canary') {
        if (startup.length >= 16) { fail('MCP_STATUS_LIMIT'); return; }
        if (!['starting', 'ready', 'failed', 'cancelled'].includes(value.params.status) || typeof value.params.threadId !== 'string') {
          fail('MCP_STATUS_INVALID'); return;
        }
        startup.push(value.params.status);
        startupThreads.push(value.params.threadId);
        if (startup.includes('starting') && startup.includes('ready')) resolveStartup(true);
      }
      if (Object.hasOwn(value, 'id')) {
        if (!current || value.id !== nextId || Object.hasOwn(value, 'result') === Object.hasOwn(value, 'error')) {
          fail('SERVER_UNEXPECTED_REPLY'); return;
        }
        const pending = current; current = null;
        pending.resolve(value);
      }
    }
  });
  function send(operation) {
    const envelope = activationEnvelope(operation);
    requests.push(envelope.method);
    if (fault) return Promise.reject(new Error(fault));
    if (!Object.hasOwn(envelope, 'id')) { server.stdin.write(JSON.stringify(envelope) + '\n'); return; }
    return new Promise((resolve, reject) => {
      current = { resolve, reject }; nextId = envelope.id;
      server.stdin.write(JSON.stringify(envelope) + '\n');
    });
  }
  const timer = setTimeout(() => fail('SERVER_DEADLINE'), 8000);
  try {
    const init = await send('initialize');
    if (init.result?.codexHome !== ENV.CODEX_HOME) throw new Error('CODEX_HOME_MISMATCH');
    send('initialized');
    const response = await send('thread');
    if (response.error) {
      // Exact pinned-source error class, not arbitrary missing-auth/config failure.
      if (!/required MCP servers failed to initialize: policy_canary: /.test(response.error.message ?? '')) throw new Error('THREAD_REJECTED_OTHER');
      thread = 'required-mcp-rejected';
      rejectionReason = response.error.message.includes('No such file or directory (os error 2)') ? 'executable-not-found' : 'initialization-failed';
    } else {
      const result = response.result;
      if (!result?.thread?.id || result.thread.ephemeral !== true || result.cwd !== '/work' ||
          result.modelProvider !== 'policy_offline' || result.approvalPolicy !== 'never' ||
          result.sandbox?.type !== 'readOnly') throw new Error('THREAD_POLICY_MISMATCH');
      thread = 'created';
      threadId = result.thread.id;
      if (expected === 'enabled') {
        if (!await started || fault) throw new Error(fault ?? 'MCP_STARTUP_UNPROVED');
        if (readBounded('/state/mcp-canary', 512) !== 'boot\ninitialize\ninitialized\ntools/list\n') throw new Error('CANARY_INCOMPLETE');
      }
    }
    if (fault) throw new Error(fault);
    closing = true;
    server.stdin.end();
    if (!await closed || fault) throw new Error(fault ?? 'SERVER_CLOSE_UNPROVED');
    if ((buffer + decoder.end()).length) throw new Error('SERVER_INCOMPLETE_JSON');
    if (threadId !== null && startupThreads.some(id => id !== threadId)) throw new Error('MCP_THREAD_MISMATCH');
    const canary = existsSync('/state/mcp-canary') ? readBounded('/state/mcp-canary', 512).trim().split('\n') : [];
    if (canary.length > 16 || canary.some(item => !['boot', 'initialize', 'initialized', 'tools/list'].includes(item))) throw new Error('CANARY_INVALID');
    return { status: 'ACTIVATION_OBSERVED', observation: { thread, canaryRecords: canary, providerReportedStartup: startup,
      rejectionReason, processClosed: true, generationObserved, requests } };
  } catch (error) {
    return { status: /^[A-Z_]+$/.test(error.message) ? error.message : 'ACTIVATION_UNAVAILABLE',
      observation: { thread, generationObserved, requests } };
  } finally { clearTimeout(timer); server.kill('SIGKILL'); }
}
