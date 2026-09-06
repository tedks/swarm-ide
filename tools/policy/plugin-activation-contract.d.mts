export const PLUGIN_ROOT: string;
export const PLUGIN_MANIFEST: string;
export const PLUGIN_MARKET: string;
export const PLUGIN_ANCESTORS: readonly string[];
export const PLUGIN_CASES: readonly { name: string; expected: string }[];
export function pluginFixture(name: string): { enabled: boolean; config: string; managed: string; manifest: string };
export function summarizePluginCases(cases: unknown): boolean;
