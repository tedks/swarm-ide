#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then
  export RUNFILES_DIR
  RUNFILES_DIR=$(readlink -f "$0.runfiles")
fi
registration_runfiles=${TEST_SRCDIR:-${RUNFILES_DIR:?Bazel runfiles required}}
if [[ -n "${BUILD_WORKSPACE_DIRECTORY:-}" ]]; then cd "$BUILD_WORKSPACE_DIRECTORY"; fi
exec node "$registration_runfiles/_main/tools/session-registration/register.cjs" "$@"
