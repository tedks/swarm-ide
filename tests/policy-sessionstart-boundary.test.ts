import { describe, expect, it } from 'vitest';
import { ACTIVATION_BOUNDARY } from '../tools/policy/activation-contract.mjs';
import { SESSIONSTART_BOUNDARY_KEYS, sessionstartFamilyMembership } from '../tools/policy/sessionstart-boundary.mjs';

const namespace = 'pid:[100]', networkNamespace = 'net:[200]';
const observation = { pid: 500, namespace, networkNamespace, internalReachable: true,
  roles: ['responder', 'canary', 'codex-substitute'].map((role, index) => ({ role, pid: index + 2, namespace, networkNamespace })) };
const processes = [1, 2, 3, 4].map((innerPid, index) => ({ pid: 500 + index, innerPid, networkNamespace }));

describe('synthetic SessionStart family evidence, without listeners or Codex', () => {
  it('requires ten additional checks without replacing the original 26', () => {
    expect(ACTIVATION_BOUNDARY).toHaveLength(26);
    expect(SESSIONSTART_BOUNDARY_KEYS).toHaveLength(10);
    expect(new Set(SESSIONSTART_BOUNDARY_KEYS).size).toBe(10);
    expect(SESSIONSTART_BOUNDARY_KEYS.filter(key => ACTIVATION_BOUNDARY.includes(key))).toEqual([]);
  });
  it('matches every independently reporting role to host process metadata', () => {
    expect(sessionstartFamilyMembership(observation, processes)).toBe(true);
    for (let index = 0; index < processes.length; index++) {
      expect(sessionstartFamilyMembership(observation, processes.filter((_, item) => item !== index))).toBe(false);
    }
  });
  it('rejects missing, duplicate and mismatched namespace evidence', () => {
    for (const invalid of [null, {}, { ...observation, internalReachable: false },
      { ...observation, roles: observation.roles.slice(1) },
      { ...observation, roles: [...observation.roles.slice(0, 2), observation.roles[0]] },
      { ...observation, namespace: 'pid:[unverified]' },
      { ...observation, roles: observation.roles.map(role => ({ ...role, networkNamespace: 'net:[201]' })) },
      { ...observation, roles: observation.roles.map(role => ({ ...role, pid: 2 })) },
      { ...observation, pid: 0 },
    ]) expect(sessionstartFamilyMembership(invalid, processes)).toBe(false);
    expect(sessionstartFamilyMembership(observation, null)).toBe(false);
    expect(sessionstartFamilyMembership(observation, processes.map(item => ({ ...item, networkNamespace: 'net:[201]' })))).toBe(false);
  });
});
