import type { GitObjectId } from "../../protocol/tasks";

export interface TaskFixture {
  readonly root: string;
  readonly firstCommit: GitObjectId;
  readonly sourceCommit: GitObjectId;
  readonly taskId: string;
  readonly secondId: string;
  readonly sourcePath: string;
  readonly sourceLine: number;
  readonly missingPath: string;
  readonly docPath: string;
  readonly sourceText: string;
  readonly title: string;
  readonly description: string;
  readonly ditzVersion: string;
  readonly ditzExecutable: string;
}
export function resolveDitzExecutable(): Promise<string>;
export function createTaskFixture(parentDir: string, options?: { ditzExecutable?: string }): Promise<TaskFixture>;
export function resumeTaskFixture(serialized: unknown, ownedParent: string): Promise<TaskFixture>;
export function advanceTaskFixture(fixture: TaskFixture): Promise<GitObjectId>;
export function advanceUnrelatedTaskFixture(fixture: TaskFixture): Promise<GitObjectId>;
export function invalidateTaskFixture(fixture: TaskFixture): Promise<GitObjectId>;
export function restoreTaskFixture(fixture: TaskFixture, commit: GitObjectId): Promise<void>;
export function removeTaskMetadata(fixture: TaskFixture): Promise<void>;
