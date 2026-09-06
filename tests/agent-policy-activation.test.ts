import { describe, expect, it } from 'vitest';
import { ACTIVATION_BOUNDARY, activationEnvelope, activationVerdict, summarizeActivationCases } from '../tools/policy/activation-contract.mjs';

const positive = { thread: 'created', traceComplete: true, generationObserved: false, execAttempts: 1,
  canary: ['boot', 'initialize', 'initialized', 'tools/list'], startup: ['starting', 'ready'],
  requests: ['initialize', 'initialized', 'thread/start'] };
const negative = { ...positive, execAttempts: 0, canary: [], startup: [] };
describe('offline auxiliary activation proof, never production authority', () => {
  it('allows only fixed initialization and ephemeral synthetic no-model thread creation', () => {
    expect(activationEnvelope('initialize').method).toBe('initialize');
    expect(activationEnvelope('initialized')).toEqual({ method: 'initialized' });
    expect(activationEnvelope('thread')).toEqual({ id: 2, method: 'thread/start', params: {
      model: 'gpt-5.2', modelProvider: 'policy_offline', cwd: '/work', approvalPolicy: 'never',
      approvalsReviewer: 'user', sandbox: 'read-only', ephemeral: true,
    } });
  });
  it.each(['turn/start', 'review/start', 'thread/compact/start', 'goal/start', 'thread/resume',
    'thread/shellCommand', 'account/login/start', 'account/login/complete', 'thread/start', '', '__proto__'])
  ('rejects unapproved operation %s before writing any RPC', operation => {
    expect(() => activationEnvelope(operation)).toThrow('ACTIVATION_RPC_FORBIDDEN');
  });
  it('does not share mutable request params across calls', () => {
    const first = activationEnvelope('thread'); first.params!.ephemeral = false;
    expect(activationEnvelope('thread').params!.ephemeral).toBe(true);
  });
  it('requires a real triggered positive opportunity and successful matched negative', () => {
    expect(activationVerdict(positive, 'enabled')).toBe(true);
    expect(activationVerdict(negative, 'disabled')).toBe(true);
    for (const canary of [[], ['boot'], ['boot', 'initialize']]) {
      expect(activationVerdict({ ...positive, canary }, 'enabled')).toBe(false);
    }
    expect(activationVerdict({ ...negative, execAttempts: 1 }, 'disabled')).toBe(false);
    expect(activationVerdict({ ...negative, startup: ['failed'] }, 'disabled')).toBe(false);
    expect(activationVerdict({ ...negative, thread: 'required-mcp-rejected' }, 'disabled')).toBe(false);
  });
  it('rejects missing trace, model activity, missing or ambiguous observation', () => {
    for (const change of [{ traceComplete: false }, { generationObserved: true }, { execAttempts: -1 },
      { execAttempts: 1.5 }, { execAttempts: 2 }, { requests: ['turn/start'] }, { canary: null }, { startup: null }]) {
      expect(activationVerdict({ ...positive, ...change }, 'enabled')).toBe(false);
    }
    expect(activationVerdict(null, 'enabled')).toBe(false);
    expect(activationVerdict(positive, 'unknown')).toBe(false);
  });
  it('requires genuine reached initialization for the required-failure control', () => {
    const failure = { ...positive, thread: 'required-mcp-rejected', canary: ['boot', 'initialize'] };
    expect(activationVerdict(failure, 'fails')).toBe(true);
    expect(activationVerdict({ ...failure, canary: [] }, 'fails')).toBe(false);
    expect(activationVerdict({ ...failure, thread: 'auth-rejected' }, 'fails')).toBe(false);
  });
  it('requires all unique matched cases, unchanged inputs and successful observations', () => {
    const cases = ['mcp-enabled', 'mcp-disabled', 'mcp-inherited', 'mcp-project-disabled', 'mcp-required-fails'].map(name => ({
      name, inputsUnchanged: true, isolation: Object.fromEntries(ACTIVATION_BOUNDARY.map(key => [key, true])),
      status: 'ACTIVATION_OBSERVED', observation: name.endsWith('disabled') ? negative :
        name.endsWith('fails') ? { ...positive, thread: 'required-mcp-rejected', canary: ['boot', 'initialize'] } : positive,
    }));
    expect(summarizeActivationCases(cases)).toBe(true);
    expect(summarizeActivationCases(cases.slice(0, 4))).toBe(false);
    expect(summarizeActivationCases([...cases.slice(0, 4), cases[0]])).toBe(false);
    expect(summarizeActivationCases(cases.map(entry => ({ ...entry, inputsUnchanged: false })))).toBe(false);
    expect(summarizeActivationCases(cases.map(entry => ({ ...entry, status: 'SERVER_EXITED' })))).toBe(false);
    for (const key of ACTIVATION_BOUNDARY) {
      expect(summarizeActivationCases(cases.map(entry => ({ ...entry, isolation: { ...entry.isolation, [key]: undefined } })))).toBe(false);
    }
  });
});
