// Fixed test-only RPCs. Never accept arbitrary methods, params, commands or history.
export const ACTIVATION_BOUNDARY = Object.freeze(['exactEnvironment', 'noCredentialsOrBus',
  'rootReadonly', 'homeReadonly', 'configReadonly', 'configParentReadonly',
  'installationIdentityCannotReplace', 'workReadonly', 'managedReadonly', 'packageReadonly',
  'noCapabilities', 'noNewPrivileges', 'canonicalRoot', 'installationSeedMatches',
  'installationIdentityWritable', 'stateWritable', 'noHostDescriptors', 'networkNamespaceEmpty',
  'outboundDenied', 'canaryExecutable', 'freshPidNamespace', 'freshNetworkNamespace',
  'ownerDeathCleanup', 'deadlineStops', 'outputStops', 'inputsUnchanged']);
export function activationEnvelope(operation) {
  if (operation === 'initialize') return { id: 1, method: 'initialize', params: {
    clientInfo: { name: 'swarm-policy-activation', version: '1' },
  } };
  if (operation === 'initialized') return { method: 'initialized' };
  if (operation === 'thread') return { id: 2, method: 'thread/start', params: {
    model: 'gpt-5.2', modelProvider: 'policy_offline', cwd: '/work',
    approvalPolicy: 'never', approvalsReviewer: 'user', sandbox: 'read-only', ephemeral: true,
  } };
  throw new Error('ACTIVATION_RPC_FORBIDDEN');
}

export function activationVerdict(observation, expected) {
  if (!observation || !['enabled', 'disabled', 'fails'].includes(expected) ||
      observation.traceComplete !== true || observation.generationObserved !== false ||
      !Number.isInteger(observation.execAttempts) || observation.execAttempts < 0 ||
      !Array.isArray(observation.canary) || !Array.isArray(observation.startup) ||
      JSON.stringify(observation.requests) !== '["initialize","initialized","thread/start"]') return false;
  const { canary, startup } = observation;
  if (expected === 'disabled') return observation.thread === 'created' &&
    observation.execAttempts === 0 && canary.length === 0 && startup.length === 0;
  if (observation.execAttempts !== 1) return false;
  if (expected === 'fails') return observation.thread === 'required-mcp-rejected' && JSON.stringify(canary) === '["boot","initialize"]';
  return observation.thread === 'created' && JSON.stringify(canary) === '["boot","initialize","initialized","tools/list"]';
}

export function summarizeActivationCases(cases) {
  const expected = new Map([['mcp-enabled', 'enabled'], ['mcp-disabled', 'disabled'],
    ['mcp-inherited', 'enabled'], ['mcp-project-disabled', 'disabled'], ['mcp-required-fails', 'fails']]);
  if (!Array.isArray(cases) || cases.length !== expected.size) return false;
  for (const entry of cases) {
    if (!expected.has(entry?.name) || entry.status !== 'ACTIVATION_OBSERVED' || entry.inputsUnchanged !== true ||
        !entry.isolation || ACTIVATION_BOUNDARY.some(key => entry.isolation[key] !== true) ||
        !activationVerdict(entry.observation, expected.get(entry.name))) return false;
    expected.delete(entry.name);
  }
  return expected.size === 0;
}
