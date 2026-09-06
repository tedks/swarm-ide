// One fixed legacy plugin fixture, never a general plugin/executable loader.
import { ACTIVATION_BOUNDARY, activationVerdict } from './activation-contract.mjs';

export const PLUGIN_ROOT = '/home/probe/.codex/plugins/cache/proof/policy-plugin/local';
export const PLUGIN_MANIFEST = `${PLUGIN_ROOT}/.codex-plugin/plugin.json`;
export const PLUGIN_MARKET = '/fixture/proof-market';
export const PLUGIN_ANCESTORS = Object.freeze([
  '/home/probe/.codex/plugins', '/home/probe/.codex/plugins/cache',
  '/home/probe/.codex/plugins/cache/proof', '/home/probe/.codex/plugins/cache/proof/policy-plugin',
  PLUGIN_ROOT, `${PLUGIN_ROOT}/.codex-plugin`, PLUGIN_MARKET,
]);
export const PLUGIN_CASES = Object.freeze([
  { name: 'plugin-enabled', expected: 'enabled' },
  { name: 'plugin-feature-disabled', expected: 'disabled' },
  { name: 'plugin-required-fails', expected: 'fails' },
].map(Object.freeze));

export function pluginFixture(name) {
  const entry = PLUGIN_CASES.find(item => item.name === name);
  if (!entry) throw new Error('PLUGIN_CASE_FORBIDDEN');
  return {
    enabled: entry.expected !== 'disabled',
    config: `[plugins."policy-plugin@proof"]\nenabled = true\n[marketplaces.proof]\nsource_type = "local"\nsource = "${PLUGIN_MARKET}"\n`,
    managed: `[marketplaces]\nrestrict_to_allowed_sources = true\n[marketplaces.allowed_sources.proof]\nsource = "local"\npath = "${PLUGIN_MARKET}"\n`,
    manifest: JSON.stringify({ name: 'policy-plugin', mcpServers: { policy_canary: {
      command: '/runtime/bin/node',
      args: ['/fixture/mcp-canary.mjs', ...(entry.expected === 'fails' ? ['fail'] : [])],
      cwd: '/work', enabled: true, required: true, startup_timeout_sec: 2, tool_timeout_sec: 2,
    } } }),
  };
}

export function summarizePluginCases(cases) {
  const expected = new Map(PLUGIN_CASES.map(item => [item.name, item.expected]));
  if (!Array.isArray(cases) || cases.length !== expected.size) return false;
  for (const entry of cases) {
    if (!expected.has(entry?.name) || entry.status !== 'ACTIVATION_OBSERVED' || entry.inputsUnchanged !== true ||
        !entry.isolation || [...ACTIVATION_BOUNDARY, 'pluginManifestReadonly', 'pluginAncestorsReadonly'].some(key => entry.isolation[key] !== true) ||
        !activationVerdict(entry.observation, expected.get(entry.name))) return false;
    expected.delete(entry.name);
  }
  return expected.size === 0;
}
