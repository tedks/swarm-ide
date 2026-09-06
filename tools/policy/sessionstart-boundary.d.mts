export const SESSIONSTART_BOUNDARY_KEYS: readonly string[];
export function sessionstartReadonlyChecks(): Record<string, boolean>;
export function sessionstartEndpointChecks(): Promise<Record<string, boolean>>;
export function sessionstartFamilyHold(): Promise<void>;
export function ownedNamespaceProcesses(namespace: string): Promise<Array<{ pid: number; innerPid?: number; networkNamespace: string }>>;
export function sessionstartFamilyMembership(observation: unknown, processes: unknown): boolean;
export function verifySessionstartLifetime(runtime: string, args: string[], trigger: 'owner' | 'deadline' | 'output'): Promise<{
  membership: boolean; hostAbsent: boolean; cleaned: boolean; cleanupSafe: boolean;
  evidence: Record<string, unknown>;
}>;
