import { isAbsolute, join } from "node:path";

// A topology build can temporarily repoint workspace/bazel-bin. Bazel's declared
// runfile is stable for this invocation and always names our fixed test artifact;
// it is not a user-selectable executable or backend.
export function rehearsalBundlePath(environment, workspace) {
  const runfiles = environment.TEST_SRCDIR || environment.RUNFILES_DIR;
  if (runfiles) {
    if (!isAbsolute(runfiles)) throw new Error("Bazel runfiles directory must be absolute");
    return join(runfiles, "_main", "tools", "agent-rehearsal.tar.gz");
  }
  return join(workspace, "bazel-bin", "tools", "agent-rehearsal.tar.gz");
}
