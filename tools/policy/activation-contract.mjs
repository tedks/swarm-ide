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
  if (!observation || !['enabled', 'disabled', 'fails', 'missing'].includes(expected) ||
      observation.processClosed !== true || observation.generationObserved !== false ||
      !Array.isArray(observation.canaryRecords) || !Array.isArray(observation.providerReportedStartup) ||
      JSON.stringify(observation.requests) !== '["initialize","initialized","thread/start"]') return false;
  const { canaryRecords: canary, providerReportedStartup: startup, rejectionReason } = observation;
  if (expected === 'disabled') return observation.thread === 'created' &&
    rejectionReason === null && canary.length === 0 && startup.length === 0;
  if (expected === 'missing') return observation.thread === 'required-mcp-rejected' &&
    rejectionReason === 'executable-not-found' && canary.length === 0;
  if (expected === 'fails') return observation.thread === 'required-mcp-rejected' &&
    rejectionReason === 'initialization-failed' && JSON.stringify(canary) === '["boot","initialize"]';
  return observation.thread === 'created' && rejectionReason === null &&
    JSON.stringify(startup) === '["starting","ready"]' && JSON.stringify(canary) === '["boot","initialize","initialized","tools/list"]';
}

export function summarizeActivationCases(cases) {
  const expected = new Map([['mcp-enabled', 'enabled'], ['mcp-disabled', 'disabled'],
    ['mcp-inherited', 'enabled'], ['mcp-project-disabled', 'disabled'], ['mcp-required-fails', 'fails'], ['mcp-missing-executable', 'missing']]);
  if (!Array.isArray(cases) || cases.length !== expected.size) return false;
  for (const entry of cases) {
    if (!expected.has(entry?.name) || entry.status !== 'ACTIVATION_OBSERVED' || entry.inputsUnchanged !== true ||
        !entry.isolation || ACTIVATION_BOUNDARY.some(key => entry.isolation[key] !== true) ||
        !activationVerdict(entry.observation, expected.get(entry.name))) return false;
    expected.delete(entry.name);
  }
  return expected.size === 0;
}
