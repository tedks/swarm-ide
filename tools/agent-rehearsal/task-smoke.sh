#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then
  export RUNFILES_DIR
  RUNFILES_DIR=$(readlink -f "$0.runfiles")
fi
task_rehearsal_scripts=$(dirname "$(readlink -f "$0")")
task_rehearsal_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$task_rehearsal_scripts")")}}
task_rehearsal_artifacts=${SWARM_ARTIFACT_DIR:-${TEST_UNDECLARED_OUTPUTS_DIR:-$task_rehearsal_source/artifacts}/task-rehearsal}
[[ "$task_rehearsal_artifacts" == /* ]] || exit 2
mkdir -p "$task_rehearsal_artifacts"
export SWARM_TASK_REHEARSAL_EVIDENCE
SWARM_TASK_REHEARSAL_EVIDENCE=$(mktemp -d "$task_rehearsal_artifacts/run.XXXXXX")
export SWARM_ARTIFACT_DIR="$SWARM_TASK_REHEARSAL_EVIDENCE"
exec "$task_rehearsal_scripts/../virtual-desktop-run.sh" "$task_rehearsal_scripts/task-scenario.sh" "$task_rehearsal_scripts/task-launch.sh" task-rehearsal
