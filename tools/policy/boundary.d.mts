import type { ChildProcess } from 'node:child_process';
export const LIMIT: number;
export const ENV: Readonly<Record<string, string>>;
export const REQUIRED: readonly string[];
export function buildArgs(runtime: string, closure: string[], fixture: string, command: string[]): string[];
export function digestTree(path: string): Promise<string>;
export function digestFile(path: string): Promise<string>;
export function validatePackageManifest(manifest: unknown): void;
export function validatePackageLayout(root: string): Promise<void>;
export function verifyAfterProcess(result: { cleanup: string }, verifyInputs: () => Promise<boolean>): Promise<{ ok: boolean; failure?: string; cleanupSafe: boolean }>;
export function summarizePages(pages: unknown, required?: readonly string[]): { features: Record<string, boolean>; missing: string[]; pages: number };
export function summarizeConfig(response: unknown, requirements: unknown): { notifyEmpty: boolean; mcpEntries: number; layerCount: number; requirementsPresent: boolean; loginShellFalse: boolean; sqlitePathMatches: boolean; logPathMatches: boolean };
export function sameNamespace(pid: number, namespace: string): Promise<boolean>;
export function boundedProcess(executable: string, args: string[], options?: { timeoutMs?: number; input?: string; seed?: boolean; onSpawn?: (child: ChildProcess) => void }): Promise<
  { ok: true; stdout: string; cleanup: 'reaped' } | { ok: false; code: string; cleanup: 'not-started' | 'reaped' | 'unknown'; exitCode?: number | null; signal?: string | null }>;
