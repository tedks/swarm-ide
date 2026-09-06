// Imported only inside the independently accepted P5 namespace. This is not a
// provider API or product capability: all outgoing requests and response bytes
// are fixed. The trusted local harness, not Codex config, supplies confinement.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { constants, existsSync, openSync, fstatSync, readSync, closeSync, readlinkSync } from 'node:fs';
import { ENV, LIMIT } from './boundary.mjs';
import { HOOK_PATH, sessionstartEnvelope, sessionstartCorrelationsMatch } from './sessionstart-contract.mjs';
import { P5_MODEL, P5_PORT, P5_PROVIDER, P5_SSE, P5_TEXT, validateSyntheticRequest } from './sessionstart-response.mjs';

function witness() {
  if (!existsSync('/state/sessionstart-witness')) return false;
  const fd = openSync('/state/sessionstart-witness', constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('HOOK_WITNESS_INVALID');
    const bytes = Buffer.alloc(2049); const size = readSync(fd, bytes, 0, bytes.length, null);
    if (size > 2048) throw new Error('HOOK_WITNESS_INVALID');
    const value = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes.subarray(0, size)));
    if (value.witness !== 'P5_SESSIONSTART' || value.source !== 'startup' || value.cwd !== '/work' ||
        value.capabilitiesAbsent !== true || value.pidNamespace !== readlinkSync('/proc/self/ns/pid') ||
        value.netNamespace !== readlinkSync('/proc/self/ns/net')) throw new Error('HOOK_WITNESS_INVALID');
    return true;
  } finally { closeSync(fd); }
}

export async function sessionstart(expected) {
  if (!['enabled', 'disabled'].includes(expected) || process.cwd() !== '/work' ||
      process.env.CODEX_HOME !== ENV.CODEX_HOME || !existsSync('/fixture/sessionstart-proof')) {
    return { status: 'SESSIONSTART_CASE_INVALID', observation: {} };
  }
  let fault = null, codex = null, current = null, nextId = null, closing = false;
  let bytes = 0, buffer = '', threadId = null, turnId = null, hookId = null;
  let resolveClosed, resolveTurn, processClosed = false, responderClosed = false;
  let httpRequests = 0, httpResponses = 0, turnStarts = 0, turnCompletions = 0;
  let hookStarted = 0, hookCompleted = 0, assistantItems = 0, assistantText = '';
  const requests = [], correlations = [], sockets = new Set();
  const decoder = new TextDecoder('utf8', { fatal: true });
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  const completed = new Promise(resolve => { resolveTurn = resolve; });
  const fail = code => {
    fault ??= code; codex?.kill('SIGKILL'); current?.reject(new Error(fault)); current = null;
    resolveClosed(false); resolveTurn(false);
    for (const socket of sockets) socket.destroy();
  };
  const responder = createServer({ maxHeaderSize: 8192, requestTimeout: 1500, headersTimeout: 1500 }, (request, response) => {
    if (++httpRequests !== 1 || fault) { fail('SYNTHETIC_EXTRA_REQUEST'); return; }
    const chunks = []; let size = 0;
    request.setTimeout(1500, () => fail('SYNTHETIC_REQUEST_DEADLINE'));
    request.on('error', () => fail('SYNTHETIC_REQUEST_FAILED'));
    request.on('aborted', () => fail('SYNTHETIC_REQUEST_INCOMPLETE'));
    request.on('data', chunk => {
      if ((size += chunk.length) > 128 * 1024) fail('SYNTHETIC_REQUEST_LIMIT');
      else if (!fault) chunks.push(chunk);
    });
    request.on('end', () => {
      if (fault) return;
      try {
        // Reject duplicate header names before Node's parsed-header coalescing.
        const names = request.rawHeaders.filter((_, index) => index % 2 === 0).map(name => name.toLowerCase());
        if (new Set(names).size !== names.length) throw new Error('SYNTHETIC_HEADERS_INVALID');
        validateSyntheticRequest(request.method, request.url, request.headers, Buffer.concat(chunks));
        if (witness() !== (expected === 'enabled')) throw new Error('HOOK_OPPORTUNITY_UNPROVED');
        response.on('error', () => fail('SYNTHETIC_RESPONSE_FAILED'));
        response.on('finish', () => { httpResponses++; });
        response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Connection': 'close', 'Content-Length': Buffer.byteLength(P5_SSE) });
        response.end(P5_SSE);
      } catch (error) { fail(/^[A-Z_]+$/.test(error.message) ? error.message : 'SYNTHETIC_REQUEST_INVALID'); }
    });
  });
  responder.maxRequestsPerSocket = 1;
  responder.on('connection', socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket));
    socket.setTimeout(1500, () => fail('SYNTHETIC_SOCKET_DEADLINE'));
    if (sockets.size > 2) fail('SYNTHETIC_CONNECTION_LIMIT');
  });
  responder.on('dropRequest', () => fail('SYNTHETIC_EXTRA_REQUEST'));
  responder.on('upgrade', () => fail('SYNTHETIC_UPGRADE_FORBIDDEN'));
  responder.on('connect', () => fail('SYNTHETIC_PROXY_FORBIDDEN'));
  responder.on('checkContinue', () => fail('SYNTHETIC_CONTINUE_FORBIDDEN'));
  responder.on('checkExpectation', () => fail('SYNTHETIC_EXPECTATION_FORBIDDEN'));
  responder.on('clientError', () => fail('SYNTHETIC_CLIENT_ERROR'));
  responder.on('error', () => fail('SYNTHETIC_LISTENER_FAILED'));
  const timer = setTimeout(() => fail('SESSIONSTART_DEADLINE'), 10000);
  try {
    await new Promise((resolve, reject) => {
      responder.once('error', reject);
      responder.listen(P5_PORT, '127.0.0.1', () => { responder.removeListener('error', reject); resolve(); });
    });
    if (fault) throw new Error(fault);
    const args = ['-c', 'sqlite_home="/state/sqlite"', '-c', 'log_dir="/state/logs"',
      '-c', 'otel.exporter="none"', '-c', 'otel.trace_exporter="none"', '-c', 'otel.metrics_exporter="none"',
      '-c', 'otel.log_user_prompt=false', '-c', 'analytics.enabled=false',
      'app-server', '--listen', 'stdio://', '--strict-config'];
    codex = spawn('/package/bin/codex', args, { env: ENV, cwd: '/work', stdio: ['pipe', 'pipe', 'pipe'] });
    codex.on('error', () => fail('SERVER_START_FAILED'));
    codex.on('exit', () => { if (!closing) fail('SERVER_EXITED'); });
    codex.on('close', (code, signal) => {
      processClosed = closing && code === 0 && signal === null && !fault;
      resolveClosed(processClosed);
    });
    codex.stdin.on('error', () => fail('SERVER_PIPE_FAILED'));
    codex.stderr.on('data', chunk => { if ((bytes += chunk.length) > LIMIT) fail('SERVER_OUTPUT_LIMIT'); });
    codex.stdout.on('data', chunk => {
      if ((bytes += chunk.length) > LIMIT) { fail('SERVER_OUTPUT_LIMIT'); return; }
      try { buffer += decoder.decode(chunk, { stream: true }); } catch { fail('SERVER_UTF8_INVALID'); return; }
      let end;
      while ((end = buffer.indexOf('\n')) >= 0 && !fault) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        try {
          const value = JSON.parse(line);
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SERVER_INVALID_JSON');
          if (Object.hasOwn(value, 'id')) {
            if (value.method || !current || value.id !== nextId || Object.hasOwn(value, 'result') === Object.hasOwn(value, 'error')) {
              throw new Error('SERVER_UNEXPECTED_REPLY_OR_REQUEST');
            }
            const pending = current; current = null;
            if (value.error) pending.reject(new Error('SERVER_RPC_REJECTED')); else pending.resolve(value.result);
            continue;
          }
          const p = value.params;
          if (['turn/started', 'turn/completed', 'item/started', 'item/completed', 'hook/started', 'hook/completed'].includes(value.method)) {
            if (!p || typeof p.threadId !== 'string' || correlations.length > 64) throw new Error('TURN_CORRELATION_INVALID');
            correlations.push({ method: value.method, params: { threadId: p.threadId, turnId: p.turnId, turn: { id: p.turn?.id } } });
          }
          if (value.method === 'turn/started') {
            if (++turnStarts !== 1) throw new Error('EXTRA_TURN');
          } else if (value.method === 'turn/completed') {
            if (++turnCompletions !== 1 || p.turn?.status !== 'completed' || p.turn.error) throw new Error('TURN_COMPLETION_INVALID');
            resolveTurn(true);
          } else if (value.method === 'item/started' || value.method === 'item/completed') {
            if (!['userMessage', 'agentMessage'].includes(p.item?.type)) throw new Error('UNEXPECTED_ITEM_OR_TOOL');
            if (value.method === 'item/completed' && p.item.type === 'agentMessage') {
              assistantItems++; assistantText = p.item.text;
              if (assistantItems !== 1 || assistantText !== P5_TEXT || p.item.questions?.length) throw new Error('SYNTHETIC_OUTPUT_INVALID');
            }
          } else if (value.method === 'hook/started' || value.method === 'hook/completed') {
            if (p.run?.eventName !== 'sessionStart' || p.run.sourcePath !== HOOK_PATH || p.run.handlerType !== 'command' ||
                p.run.executionMode !== 'sync' || typeof p.run.id !== 'string') throw new Error('UNEXPECTED_HOOK');
            if (value.method === 'hook/started') {
              if (++hookStarted !== 1 || p.run.status !== 'running') throw new Error('HOOK_START_INVALID');
              hookId = p.run.id;
            } else if (++hookCompleted !== 1 || p.run.status !== 'completed' || p.run.id !== hookId) throw new Error('HOOK_COMPLETION_INVALID');
          } else if (/^(mcpServer\/startupStatus\/updated|item\/(commandExecution|mcpToolCall|dynamicToolCall|fileChange)|serverRequest\/)/.test(value.method ?? '')) {
            throw new Error('AUXILIARY_ACTIVITY_UNEXPECTED');
          }
        } catch (error) { fail(/^[A-Z_]+$/.test(error.message) ? error.message : 'SERVER_INVALID_JSON'); }
      }
    });
    function send(operation) {
      const envelope = sessionstartEnvelope(operation, threadId);
      if (fault || current || requests.includes(envelope.method)) throw new Error(fault ?? 'SESSIONSTART_DUPLICATE_RPC');
      requests.push(envelope.method);
      if (!Object.hasOwn(envelope, 'id')) { codex.stdin.write(JSON.stringify(envelope) + '\n'); return; }
      return new Promise((resolve, reject) => {
        current = { resolve, reject }; nextId = envelope.id;
        codex.stdin.write(JSON.stringify(envelope) + '\n');
      });
    }
    const init = await send('initialize');
    if (init?.codexHome !== ENV.CODEX_HOME) throw new Error('CODEX_HOME_MISMATCH');
    send('initialized');
    const thread = await send('thread');
    if (!/^[a-f0-9-]{36}$/.test(thread?.thread?.id ?? '') || thread.thread.ephemeral !== true || thread.cwd !== '/work' ||
        thread.model !== P5_MODEL || thread.modelProvider !== P5_PROVIDER || thread.approvalPolicy !== 'never' ||
        thread.sandbox?.type !== 'readOnly') throw new Error('THREAD_POLICY_MISMATCH');
    threadId = thread.thread.id;
    const turn = await send('turn');
    if (typeof turn?.turn?.id !== 'string' || !turn.turn.id.length || turn.turn.id.length > 128) throw new Error('TURN_ID_INVALID');
    turnId = turn.turn.id;
    if (!await completed || fault) throw new Error(fault ?? 'TURN_COMPLETION_UNPROVED');
    closing = true; codex.stdin.end();
    if (!await closed || fault) throw new Error(fault ?? 'SERVER_CLOSE_UNPROVED');
    if ((buffer + decoder.decode()).length) throw new Error('SERVER_INCOMPLETE_JSON');
    if (!sessionstartCorrelationsMatch(correlations, threadId, turnId)) throw new Error('TURN_CORRELATION_MISMATCH');
    await new Promise((resolve, reject) => responder.close(error => error ? reject(error) : resolve()));
    responderClosed = true;
    if (fault) throw new Error(fault);
    return { status: 'SESSIONSTART_OBSERVED', observation: { syntheticTurnExecuted: turnStarts === 1,
      turnCompleted: turnCompletions === 1, localResponseDelivered: httpResponses === 1,
      externalModelInference: false, productionAvailable: false, httpRequests, httpResponses, turnStarts,
      turnCompletions, hookStarted, hookCompleted, hookWitness: witness(), canaryNamespaceMatches: true,
      assistantItems, assistantText, processClosed, responderClosed, requests,
      auxiliaryAttemptObservation: 'unproved; isolation contains outbound attempts, it does not disable exporters',
    } };
  } catch (error) {
    return { status: fault ?? (/^[A-Z_]+$/.test(error.message) ? error.message : 'SESSIONSTART_UNAVAILABLE'),
      observation: { syntheticTurnExecuted: turnStarts > 0, turnStarts, turnCompletions, httpRequests, httpResponses,
        localResponseDelivered: httpResponses > 0, externalModelInference: false, productionAvailable: false,
        processClosed, responderClosed, requests } };
  } finally {
    clearTimeout(timer); codex?.kill('SIGKILL');
    for (const socket of sockets) socket.destroy();
    responder.closeAllConnections(); responder.close();
  }
}
