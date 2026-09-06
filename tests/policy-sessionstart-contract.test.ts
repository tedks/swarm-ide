import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTIVATION_BOUNDARY, activationEnvelope } from '../tools/policy/activation-contract.mjs';
import { SESSIONSTART_BOUNDARY_KEYS } from '../tools/policy/sessionstart-boundary.mjs';
import { HOOK_CANONICAL, HOOK_KEY, HOOK_TRUST, SESSIONSTART_CASES, sessionstartEnvelope,
  sessionstartVerdict, sessionstartCorrelationsMatch, summarizeSessionStartCases } from '../tools/policy/sessionstart-contract.mjs';
import { P5_TEXT } from '../tools/policy/sessionstart-response.mjs';

const good = (enabled = true): Record<string, unknown> => ({ syntheticTurnExecuted: true, turnCompleted: true,
  localResponseDelivered: true, externalModelInference: false, productionAvailable: false, processClosed: true,
  responderClosed: true, httpRequests: 1, httpResponses: 1, turnStarts: 1, turnCompletions: 1, assistantText: P5_TEXT,
  assistantItems: 1, canaryNamespaceMatches: true, requests: ['initialize', 'initialized', 'thread/start', 'turn/start'],
  hookWitness: enabled, hookStarted: enabled ? 1 : 0, hookCompleted: enabled ? 1 : 0 });
const entries = () => SESSIONSTART_CASES.map(value => ({ name: value.name, status: 'SESSIONSTART_OBSERVED',
  inputsUnchanged: true, isolation: Object.fromEntries(ACTIVATION_BOUNDARY.map(key => [key, true])),
  sessionstartIsolation: Object.fromEntries(SESSIONSTART_BOUNDARY_KEYS.map(key => [key, true])),
  observation: good(value.expected === 'enabled') }));

describe('separate fixed SessionStart profile', () => {
  it('rejects malformed synthetic turn/item transcripts while allowing nullable hook turn IDs only', () => {
    const thread = '00000000-0000-4000-8000-000000000001', turn = 'synthetic-turn-1';
    for (const method of ['turn/started', 'turn/completed', 'item/started', 'item/completed']) {
      const params = (id: unknown) => ({ threadId: thread, ...(method.startsWith('turn/') ? { turn: { id } } : { turnId: id }) });
      expect(sessionstartCorrelationsMatch([{ method, params: params(turn) }], thread, turn)).toBe(true);
      for (const bad of [undefined, null, '', 'wrong-turn']) {
        expect(sessionstartCorrelationsMatch([{ method, params: params(bad) }], thread, turn)).toBe(false);
      }
      expect(sessionstartCorrelationsMatch([{ method, params: { ...params(turn), threadId: 'wrong-thread' } }], thread, turn)).toBe(false);
    }
    for (const method of ['hook/started', 'hook/completed']) {
      for (const id of [undefined, null, turn]) expect(sessionstartCorrelationsMatch([{ method, params: { threadId: thread, turnId: id } }], thread, turn)).toBe(true);
      expect(sessionstartCorrelationsMatch([{ method, params: { threadId: thread, turnId: 'wrong-turn' } }], thread, turn)).toBe(false);
    }
    expect(sessionstartCorrelationsMatch([{ method: 'turn/completed', params: { threadId: thread, turnId: turn } }], thread, turn)).toBe(false);
    for (const invalid of [null, [], [{ method: 'other', params: { threadId: thread, turnId: turn } }], [null]]) {
      expect(sessionstartCorrelationsMatch(invalid, thread, turn)).toBe(false);
    }
  });
  it('pairs exact immutable hook/trust inputs with only the ordinary feature exclusion changed', () => {
    expect(SESSIONSTART_CASES).toHaveLength(2);
    expect(SESSIONSTART_CASES[0].user.replace('hooks = true', 'hooks = false')).toBe(SESSIONSTART_CASES[1].user);
    expect(SESSIONSTART_CASES[0].hook).toBe(SESSIONSTART_CASES[1].hook);
    expect(HOOK_KEY).toBe('/home/probe/.codex/hooks.json:session_start:0:0');
    expect(HOOK_TRUST).toBe('sha256:' + createHash('sha256').update(HOOK_CANONICAL).digest('hex'));
    expect(SESSIONSTART_CASES[0].user).toContain(`trusted_hash = "${HOOK_TRUST}"`);
    for (const setting of ['request_max_retries = 0', 'stream_max_retries = 0', 'unbounded_connection_retries = false',
      'supports_websockets = false', 'requires_openai_auth = false', 'include_environment_context = false',
      'shell_snapshot_v2 = false', 'use_agent_identity = false', 'web_search = "disabled"']) {
      expect(SESSIONSTART_CASES[0].user).toContain(setting);
    }
    expect(SESSIONSTART_CASES[0].user).not.toMatch(/bypass|env_key|bearer|api_key/);
  });
  it('allows only the one fixed turn after an observed thread ID; old no-turn allowlist remains closed', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(sessionstartEnvelope('turn', id)).toEqual({ id: 3, method: 'turn/start', params: { threadId: id,
      input: [{ type: 'text', text: 'Synthetic policy SessionStart probe.', text_elements: [] }] } });
    expect(() => activationEnvelope('turn')).toThrow('ACTIVATION_RPC_FORBIDDEN');
    for (const operation of ['turn/start', 'auth', 'resume', 'review', 'compact', 'shell', 'steer', 'interrupt', 'goal']) {
      expect(() => sessionstartEnvelope(operation, id)).toThrow('SESSIONSTART_RPC_FORBIDDEN');
    }
    expect(() => sessionstartEnvelope('turn', '/work')).toThrow('SESSIONSTART_RPC_FORBIDDEN');
  });
  it('requires both actual opportunity controls, not failed recognition or a no-turn absence', () => {
    expect(sessionstartVerdict(good(), 'enabled')).toBe(true);
    expect(sessionstartVerdict(good(false), 'disabled')).toBe(true);
    expect(sessionstartVerdict(good(false), 'enabled')).toBe(false);
    expect(sessionstartVerdict(good(), 'disabled')).toBe(false);
    expect(sessionstartVerdict(null, 'disabled')).toBe(false);
    expect(sessionstartVerdict(good(), 'unknown')).toBe(false);
  });
  for (const key of Object.keys(good())) {
    it(`rejects missing evidence ${key}`, () => {
      const observation = good(); delete observation[key];
      expect(sessionstartVerdict(observation, 'enabled')).toBe(false);
    });
  }
  it('rejects extra requests, incomplete output, false model claims and uncorrelated canary', () => {
    for (const delta of [{ httpRequests: 2 }, { httpResponses: 0 }, { turnStarts: 2 }, { turnCompletions: 0 },
      { assistantText: 'tool-call' }, { externalModelInference: true }, { productionAvailable: true },
      { hookCompleted: 0 }, { canaryNamespaceMatches: false }, { responderClosed: false }]) {
      expect(sessionstartVerdict({ ...good(), ...delta }, 'enabled')).toBe(false);
    }
  });
  it('requires the unchanged original26 and every additional check for each distinct case', () => {
    expect(ACTIVATION_BOUNDARY).toHaveLength(26);
    expect(SESSIONSTART_BOUNDARY_KEYS).toHaveLength(10);
    expect(summarizeSessionStartCases(entries())).toBe(true);
    expect(summarizeSessionStartCases([entries()[0], entries()[0]])).toBe(false);
    expect(summarizeSessionStartCases(entries().slice(0, 1))).toBe(false);
    for (const key of ACTIVATION_BOUNDARY) {
      const cases = entries(); cases[0].isolation[key] = false;
      expect(summarizeSessionStartCases(cases)).toBe(false);
    }
    for (const key of SESSIONSTART_BOUNDARY_KEYS) {
      const cases = entries(); delete cases[1].sessionstartIsolation[key];
      expect(summarizeSessionStartCases(cases)).toBe(false);
    }
  });
  it('keeps actual-turn targets manual and freezes response/driver outside the product', () => {
    const build = readFileSync('tools/policy/BUILD.bazel', 'utf8');
    expect(build).toMatch(/name = "sessionstart-test",[\s\S]*?tags = \["manual", "local", "no-sandbox"\]/);
    const driver = readFileSync('tools/policy/sessionstart.mjs', 'utf8');
    expect(driver).not.toContain('generationObserved');
    expect(driver).toContain("if (++httpRequests !== 1");
    expect(driver).toContain("witness() !== (expected === 'enabled')");
    expect(driver).toContain("responder.listen(P5_PORT, '127.0.0.1'");
  });
});
