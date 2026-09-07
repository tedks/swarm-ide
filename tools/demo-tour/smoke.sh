#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then
  export RUNFILES_DIR
  RUNFILES_DIR=$(readlink -f "$0.runfiles")
fi
tour_scripts=$(dirname "$(readlink -f "$0")")
tour_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$tour_scripts")")}}
tour_artifacts=${SWARM_ARTIFACT_DIR:-$tour_source/artifacts/demo-tour}
[[ "$tour_artifacts" == /* ]] || { echo 'Tour evidence directory must be absolute'; exit 2; }
mkdir -p "$tour_artifacts"
export SWARM_ARTIFACT_DIR
SWARM_ARTIFACT_DIR=$(mktemp -d "$tour_artifacts/run.XXXXXX")
export SWARM_TOUR_EVIDENCE="$SWARM_ARTIFACT_DIR"
export SWARM_APP_START_TIMEOUT_MS=120000
export SWARM_SCENARIO_TIMEOUT_SECONDS=210
exec "$tour_scripts/../virtual-desktop-run.sh" "$tour_scripts/scenario.sh" "$tour_scripts/launch.sh" demo-connected-tour
