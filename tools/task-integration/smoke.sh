#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then
  export RUNFILES_DIR
  RUNFILES_DIR=$(readlink -f "$0.runfiles")
fi
task_scripts=$(dirname "$(readlink -f "$0")")
task_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$task_scripts")")}}
task_artifacts=${SWARM_ARTIFACT_DIR:-${TEST_UNDECLARED_OUTPUTS_DIR:-$task_source/artifacts}/task-integration}
[[ "$task_artifacts" == /* ]] || { echo 'Task evidence directory must be absolute'; exit 2; }
mkdir -p "$task_artifacts"
export SWARM_ARTIFACT_DIR
SWARM_ARTIFACT_DIR=$(mktemp -d "$task_artifacts/run.XXXXXX")
export SWARM_TASK_EVIDENCE="$SWARM_ARTIFACT_DIR"
exec "$task_scripts/../virtual-desktop-run.sh" "$task_scripts/scenario.sh" "$task_scripts/launch.sh" task-integration
