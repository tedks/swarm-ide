import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTIVATION_BOUNDARY } from '../tools/policy/activation-contract.mjs';
import { PLUGIN_CASES, PLUGIN_MANIFEST, PLUGIN_ANCESTORS, pluginFixture, summarizePluginCases } from '../tools/policy/plugin-activation-contract.mjs';

const positive = { thread: 'created', processClosed: true, generationObserved: false, rejectionReason: null,
  canaryRecords: ['boot', 'initialize', 'initialized', 'tools/list'], providerReportedStartup: ['starting', 'ready'],
  requests: ['initialize', 'initialized', 'thread/start'] };
const negative = { ...positive, canaryRecords: [], providerReportedStartup: [] };
const failure = { ...negative, thread: 'required-mcp-rejected', rejectionReason: 'initialization-failed', canaryRecords: ['boot', 'initialize'] };
const checks = [...ACTIVATION_BOUNDARY, 'pluginManifestReadonly', 'pluginAncestorsReadonly'];
function cases() {
  return PLUGIN_CASES.map(({ name, expected }) => ({ name, status: 'ACTIVATION_OBSERVED', inputsUnchanged: true,
    isolation: Object.fromEntries(checks.map(key => [key, true])),
    observation: structuredClone(expected === 'enabled' ? positive : expected === 'disabled' ? negative : failure),
  }));
describe('one fixed plugin-provided MCP startup comparison, not a production certificate', () => {
  it('changes only the feature gate for the matched positive and negative', () => {
    const on = pluginFixture('plugin-enabled'), off = pluginFixture('plugin-feature-disabled');
    expect(on.enabled).toBe(true); expect(off.enabled).toBe(false);
    expect({ ...on, enabled: false }).toEqual(off);
    expect(on.config).not.toContain('[mcp_servers.');
    expect(on.config).toContain('[plugins."policy-plugin@proof"]\nenabled = true');
    expect(on.managed).toContain('restrict_to_allowed_sources = true');
    expect(on.managed).toContain('source = "local"');
    const manifest = JSON.parse(on.manifest);
    expect(manifest.name).toBe('policy-plugin');
    expect(manifest.mcpServers).toEqual({ policy_canary: {
      command: '/runtime/bin/node', args: ['/fixture/mcp-canary.mjs'], cwd: '/work', enabled: true,
      required: true, startup_timeout_sec: 2, tool_timeout_sec: 2,
    } });
    expect(PLUGIN_MANIFEST).toBe('/home/probe/.codex/plugins/cache/proof/policy-plugin/local/.codex-plugin/plugin.json');
    expect(PLUGIN_ANCESTORS).toHaveLength(7);
  });
  it('changes only the fixed reached-initialize failure argument', () => {
    const on = pluginFixture('plugin-enabled'), bad = pluginFixture('plugin-required-fails');
    expect({ ...bad, manifest: on.manifest }).toEqual(on);
    const manifest = JSON.parse(bad.manifest);
    expect(manifest.mcpServers.policy_canary.args.pop()).toBe('fail');
    expect(manifest).toEqual(JSON.parse(on.manifest));
  });
  it.each(['__proto__', 'plugin-missing', 'turn/start', '', '/host/plugin'])('rejects unsupported fixture %s', name => {
    expect(() => pluginFixture(name)).toThrow('PLUGIN_CASE_FORBIDDEN');
  });
  it('requires three distinct fully observed controls', () => {
    expect(summarizePluginCases(cases())).toBe(true);
    expect(summarizePluginCases(null)).toBe(false);
    expect(summarizePluginCases(cases().slice(0, 2))).toBe(false);
    const duplicate = cases(); duplicate[2] = duplicate[0]!;
    expect(summarizePluginCases(duplicate)).toBe(false);
  });
  it.each(checks)('requires the independent %s check for every actual case', key => {
    for (let index = 0; index < 3; index++) {
      const value = cases(); delete value[index]!.isolation[key];
      expect(summarizePluginCases(value)).toBe(false);
    }
  });
  it.each(['SERVER_DEADLINE', 'BOUNDARY_UNAVAILABLE', 'SERVER_INVALID_JSON', 'SERVER_EXITED'])
  ('never interprets %s as plugin disablement', status => {
    const value = cases(); value[1]!.status = status;
    expect(summarizePluginCases(value)).toBe(false);
  });
  it('rejects changed input, generation, partial/out-of-order and unclosed evidence', () => {
    for (const observation of [
      { ...positive, processClosed: false }, { ...positive, generationObserved: true },
      { ...positive, providerReportedStartup: ['ready', 'starting'] }, { ...positive, canaryRecords: ['boot'] },
      { ...positive, requests: ['initialize', 'initialized', 'thread/start', 'turn/start'] },
    ]) {
      const value = cases(); value[0]!.observation = observation;
      expect(summarizePluginCases(value)).toBe(false);
    }
    const changed = cases(); changed[2]!.inputsUnchanged = false;
    expect(summarizePluginCases(changed)).toBe(false);
    const broken = cases(); broken[1]!.observation = failure;
    expect(summarizePluginCases(broken)).toBe(false);
    const noOpportunity = cases(); noOpportunity[2]!.observation = negative;
    expect(summarizePluginCases(noOpportunity)).toBe(false);
  });
  it('keeps actual installed execution manual and fixed-RPC observer shared with the static controls', () => {
    const build = readFileSync('tools/policy/BUILD.bazel', 'utf8');
    const target = build.slice(build.indexOf('name = "plugin-activation-test"')).split('sh_test(')[0];
    expect(target).toContain('tags = ["manual", "local", "no-sandbox"]');
    expect(readFileSync('tools/policy/plugin-activation.test.sh', 'utf8')).toContain('probe.sh" --plugin-activation');
    expect(readFileSync('tools/policy/probe.mjs', 'utf8')).toContain('activation && !await verifyBoundary(path)');
  });
});
