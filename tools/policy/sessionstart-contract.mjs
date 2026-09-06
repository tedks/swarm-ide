// Fixed test-only inputs. Source trust identity is NOT a hash of executable bytes;
// the separate immutable fixture boundary must pin the canary and every ancestor.
import { createHash } from 'node:crypto';
import { ACTIVATION_BOUNDARY } from './activation-contract.mjs';
import { SESSIONSTART_BOUNDARY_KEYS } from './sessionstart-boundary.mjs';
import { P5_MODEL, P5_PORT, P5_PROMPT, P5_PROVIDER, P5_TEXT } from './sessionstart-response.mjs';

export const HOOK_PATH = '/home/probe/.codex/hooks.json';
export const HOOK_KEY = `${HOOK_PATH}:session_start:0:0`;
export const HOOK_CANONICAL = '{"event_name":"session_start","hooks":[{"async":false,"command":"/runtime/bin/node /fixture/sessionstart-canary.mjs","timeout":2,"type":"command"}],"matcher":"startup"}';
export const HOOK_TRUST = 'sha256:' + createHash('sha256').update(HOOK_CANONICAL).digest('hex');
const hook = JSON.stringify({ hooks: { SessionStart: [{ matcher: 'startup', hooks: [{
  type: 'command', command: '/runtime/bin/node /fixture/sessionstart-canary.mjs', timeout: 2, async: false,
}] }] } });

const config = enabled => `model = "${P5_MODEL}"
model_provider = "${P5_PROVIDER}"
include_environment_context = false
web_search = "disabled"
allow_login_shell = false
notify = []
[projects."/work"]
trust_level = "trusted"
[features]
hooks = ${enabled}
plugin_hooks = false
plugins = false
apps = false
multi_agent = false
multi_agent_v2 = false
remote_control = false
remote_plugin = false
recommended_plugins = false
unbounded_connection_retries = false
code_mode = false
code_mode_prewarm = false
shell_snapshot = false
shell_snapshot_v2 = false
shell_tool = false
unified_exec = false
memories = false
memory_tool = false
use_agent_identity = false
[memories]
generate_memories = false
use_memories = false
[hooks.state."${HOOK_KEY}"]
trusted_hash = "${HOOK_TRUST}"
[model_providers.${P5_PROVIDER}]
name = "Policy P5 text once"
base_url = "http://127.0.0.1:${P5_PORT}/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
stream_idle_timeout_ms = 2000
`;
export const SESSIONSTART_CASES = Object.freeze(['enabled', 'disabled'].map(expected => Object.freeze({
  name: `sessionstart-${expected}`, expected, user: config(expected === 'enabled'), hook, trust: HOOK_TRUST,
})));

// Only the generated thread identity crosses between fixed RPC envelopes. No
// caller-controlled prompt, cwd, URL, command, model, method or arbitrary params.
export function sessionstartEnvelope(operation, threadId) {
  if (operation === 'initialize') return { id: 1, method: 'initialize', params: {
    clientInfo: { name: 'swarm-policy-sessionstart', version: '1' },
  } };
  if (operation === 'initialized') return { method: 'initialized' };
  if (operation === 'thread') return { id: 2, method: 'thread/start', params: {
    model: P5_MODEL, modelProvider: P5_PROVIDER, cwd: '/work', approvalPolicy: 'never',
    approvalsReviewer: 'user', sandbox: 'read-only', ephemeral: true,
  } };
  if (operation === 'turn' && typeof threadId === 'string' && /^[a-f0-9-]{36}$/.test(threadId)) {
    return { id: 3, method: 'turn/start', params: { threadId, input: [{ type: 'text', text: P5_PROMPT, text_elements: [] }] } };
  }
  throw new Error('SESSIONSTART_RPC_FORBIDDEN');
}

export function sessionstartVerdict(o, expected) {
  if (!o || !['enabled', 'disabled'].includes(expected) || o.syntheticTurnExecuted !== true ||
      o.turnCompleted !== true || o.localResponseDelivered !== true || o.externalModelInference !== false ||
      o.productionAvailable !== false || o.processClosed !== true || o.responderClosed !== true ||
      o.httpRequests !== 1 || o.httpResponses !== 1 || o.turnStarts !== 1 || o.turnCompletions !== 1 ||
      o.assistantText !== P5_TEXT || o.assistantItems !== 1 || o.canaryNamespaceMatches !== true ||
      JSON.stringify(o.requests) !== '["initialize","initialized","thread/start","turn/start"]') return false;
  return expected === 'enabled'
    ? o.hookWitness === true && o.hookStarted === 1 && o.hookCompleted === 1
    : o.hookWitness === false && o.hookStarted === 0 && o.hookCompleted === 0;
}

/** Correlate fixed protocol notifications with the acknowledged thread/turn. */
export function sessionstartCorrelationsMatch(events, threadId, turnId) {
  if (!Array.isArray(events) || events.length === 0 || events.length > 64 ||
      typeof threadId !== 'string' || !threadId.length || typeof turnId !== 'string' || !turnId.length) return false;
  return events.every(value => {
    if (!value || !['turn/started', 'turn/completed', 'item/started', 'item/completed', 'hook/started', 'hook/completed'].includes(value.method) ||
        value.params?.threadId !== threadId) return false;
    const id = value.method.startsWith('turn/') ? value.params.turn?.id : value.params.turnId;
    // Only hook notifications permit absent/null turn IDs in installed v2.
    if (value.method.startsWith('hook/') && id == null) return true;
    return typeof id === 'string' && id === turnId;
  });
}

export function summarizeSessionStartCases(cases) {
  if (!Array.isArray(cases) || cases.length !== 2) return false;
  const names = new Set();
  for (const entry of cases) {
    const expected = SESSIONSTART_CASES.find(value => value.name === entry?.name)?.expected;
    if (!expected || names.has(entry.name) || entry.status !== 'SESSIONSTART_OBSERVED' || entry.inputsUnchanged !== true ||
        !entry.isolation || ACTIVATION_BOUNDARY.some(key => entry.isolation[key] !== true) ||
        !entry.sessionstartIsolation || SESSIONSTART_BOUNDARY_KEYS.some(key => entry.sessionstartIsolation[key] !== true) ||
        !sessionstartVerdict(entry.observation, expected)) return false;
    names.add(entry.name);
  }
  return names.size === 2;
}
