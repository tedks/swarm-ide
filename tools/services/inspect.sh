#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
service_runfiles=${TEST_SRCDIR:-${RUNFILES_DIR:-}}
if [[ -n "$service_runfiles" ]]; then
  exec node "$service_runfiles/_main/tools/services/inspect.cjs" "$@"
fi
exec node "${BUILD_WORKSPACE_DIRECTORY:?}/bazel-bin/tools/services/inspect.cjs" "$@"
