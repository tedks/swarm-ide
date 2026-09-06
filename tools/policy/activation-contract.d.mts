export function activationEnvelope(operation: string): { id?: number; method: string; params?: Record<string, unknown> };
export function activationVerdict(observation: unknown, expected: string): boolean;
export function summarizeActivationCases(cases: unknown): boolean;
export const ACTIVATION_BOUNDARY: readonly string[];
