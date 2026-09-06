import { isTaskSourcePath, type GitObjectId, type TaskFileRef } from "../../../protocol/tasks";

/** Display data, never HTML or instructions; preserve ordinary text layout. */
export function displayTaskText(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, (char) => char === "\n" || char === "\t" ? char : `\\u{${char.codePointAt(0)!.toString(16)}}`);
}

export const taskRevisionLabel = (revision: GitObjectId): string => `${revision.algorithm}:${revision.hex}`;

/** A candidate is not a resolved file. The core broker still owns that check. */
export function canRevealTaskRef(ref: TaskFileRef): boolean {
  return ref.navigation === "candidate" && isTaskSourcePath(ref.path) &&
    (ref.line === null || Number.isSafeInteger(ref.line) && ref.line > 0);
}
