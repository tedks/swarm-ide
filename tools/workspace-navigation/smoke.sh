#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
scripts=$(dirname "$(readlink -f "$0")")
export SWARM_VIRTUAL_DESKTOP_PORT=${SWARM_VIRTUAL_DESKTOP_PORT:-55432}
export SWARM_APP_START_TIMEOUT_MS=60000
export SWARM_SCENARIO_TIMEOUT_SECONDS=90
export SWARM_ARTIFACT_DIR=${SWARM_ARTIFACT_DIR:-${BUILD_WORKSPACE_DIRECTORY:?}/artifacts/workspace-navigation}
exec "$scripts/../virtual-desktop-run.sh" "$scripts/scenario.sh" "$scripts/launch.sh" workspace-navigation
