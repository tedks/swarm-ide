#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then
  export RUNFILES_DIR
  RUNFILES_DIR=$(readlink -f "$0.runfiles")
fi
scripts=$(dirname "$(readlink -f "$0")")
density_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$scripts")")}}
density_artifacts=${SWARM_ARTIFACT_DIR:-$density_source/artifacts/task-workspace}
[[ "$density_artifacts" == /* ]] || { echo 'Absolute evidence path required'; exit 2; }
mkdir -p "$density_artifacts"
export SWARM_ARTIFACT_DIR
SWARM_ARTIFACT_DIR=$(mktemp -d "$density_artifacts/run.XXXXXX")
export SWARM_TASK_WORKSPACE_EVIDENCE="$SWARM_ARTIFACT_DIR" SWARM_PLANS_CASE=demo
export SWARM_APP_START_TIMEOUT_MS=120000 SWARM_SCENARIO_TIMEOUT_SECONDS=100
exec "$scripts/../virtual-desktop-run.sh" "$scripts/scenario.sh" "$scripts/launch.sh" task-workspace
