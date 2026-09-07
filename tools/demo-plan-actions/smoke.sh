#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then
  export RUNFILES_DIR
  RUNFILES_DIR=$(readlink -f "$0.runfiles")
fi
actions_scripts=$(dirname "$(readlink -f "$0")")
actions_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$actions_scripts")")}}
actions_artifacts=${SWARM_ARTIFACT_DIR:-${TEST_UNDECLARED_OUTPUTS_DIR:-$actions_source/artifacts}/demo-plan-actions}
[[ "$actions_artifacts" == /* ]] || { echo 'Plan action evidence must be absolute'; exit 2; }
mkdir -p "$actions_artifacts"
export SWARM_ARTIFACT_DIR
SWARM_ARTIFACT_DIR=$(mktemp -d "$actions_artifacts/run.XXXXXX")
export SWARM_PLANS_EVIDENCE="$SWARM_ARTIFACT_DIR"
export SWARM_PLANS_CASE=demo
export SWARM_APP_START_TIMEOUT_MS=120000
export SWARM_SCENARIO_TIMEOUT_SECONDS=120
exec "$actions_scripts/../virtual-desktop-run.sh" "$actions_scripts/scenario.sh" "$actions_scripts/launch.sh" demo-plan-actions
