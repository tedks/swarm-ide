#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then
  export RUNFILES_DIR
  RUNFILES_DIR=$(readlink -f "$0.runfiles")
fi
activity_scripts=$(dirname "$(readlink -f "$0")")
activity_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$activity_scripts")")}}
activity_artifacts=${SWARM_ARTIFACT_DIR:-$activity_source/artifacts/activity-usability}
[[ "$activity_artifacts" == /* ]] || { echo 'Activity evidence directory must be absolute'; exit 2; }
mkdir -p "$activity_artifacts"
export SWARM_ARTIFACT_DIR
SWARM_ARTIFACT_DIR=$(mktemp -d "$activity_artifacts/run.XXXXXX")
export SWARM_ACTIVITY_USABILITY_EVIDENCE="$SWARM_ARTIFACT_DIR"
export SWARM_VIRTUAL_DISPLAY="${SWARM_VIRTUAL_DISPLAY:-:164}"
export SWARM_VIRTUAL_DESKTOP_PORT="${SWARM_VIRTUAL_DESKTOP_PORT:-55413}"
export SWARM_APP_START_TIMEOUT_MS=90000
export SWARM_SCENARIO_TIMEOUT_SECONDS=50
exec "$activity_scripts/../virtual-desktop-run.sh" "$activity_scripts/scenario.sh" "$activity_scripts/launch.sh" activity-usability
