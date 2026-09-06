export const HOOK_PATH: string;
export const HOOK_KEY: string;
export const HOOK_CANONICAL: string;
export const HOOK_TRUST: string;
export const SESSIONSTART_CASES: readonly Readonly<{ name: string; expected: string; user: string; hook: string; trust: string }>[];
export function sessionstartEnvelope(operation: string, threadId?: string): { id?: number; method: string; params?: Record<string, unknown> };
export function sessionstartVerdict(observation: unknown, expected: unknown): boolean;
export function summarizeSessionStartCases(cases: unknown): boolean;
