#!/usr/bin/env bash
set -euo pipefail
task_rehearsal_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies source workspace}"
exec node "$task_rehearsal_scripts/task-launch.mjs"
