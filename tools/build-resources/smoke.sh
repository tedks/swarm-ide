#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then
  export RUNFILES_DIR
  RUNFILES_DIR=$(readlink -f "$0.runfiles")
fi
resources_scripts=$(dirname "$(readlink -f "$0")")
resources_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$resources_scripts")")}}
resources_artifacts=${SWARM_ARTIFACT_DIR:-$resources_source/artifacts/build-resources}
[[ "$resources_artifacts" == /* ]] || { echo 'Build resource evidence directory must be absolute'; exit 2; }
mkdir -p "$resources_artifacts"
export SWARM_ARTIFACT_DIR
SWARM_ARTIFACT_DIR=$(mktemp -d "$resources_artifacts/run.XXXXXX")
export SWARM_RESOURCES_EVIDENCE="$SWARM_ARTIFACT_DIR"
export SWARM_VIRTUAL_DISPLAY="${SWARM_VIRTUAL_DISPLAY:-:140}"
export SWARM_VIRTUAL_DESKTOP_PORT="${SWARM_VIRTUAL_DESKTOP_PORT:-55220}"
export SWARM_APP_START_TIMEOUT_MS=90000
export SWARM_SCENARIO_TIMEOUT_SECONDS=80
# The shared supervisor checks the display lock/socket and loopback port before
# launch, records identities, and removes only this run's children and profile.
exec "$resources_scripts/../virtual-desktop-run.sh" "$resources_scripts/scenario.sh" "$resources_scripts/launch.sh" build-resources
