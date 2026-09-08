#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
design_scripts=$(dirname "$(readlink -f "$0")")
design_artifacts=${SWARM_ARTIFACT_DIR:-${BUILD_WORKSPACE_DIRECTORY:?}/artifacts/living-design}
mkdir -p "$design_artifacts"
export SWARM_ARTIFACT_DIR
SWARM_ARTIFACT_DIR=$(mktemp -d "$design_artifacts/run.XXXXXX")
export SWARM_DESIGN_EVIDENCE="$SWARM_ARTIFACT_DIR"
export SWARM_VIRTUAL_DISPLAY=${SWARM_VIRTUAL_DISPLAY:-:184}
export SWARM_VIRTUAL_DESKTOP_PORT=${SWARM_VIRTUAL_DESKTOP_PORT:-55334}
export SWARM_APP_START_TIMEOUT_MS=60000
export SWARM_SCENARIO_TIMEOUT_SECONDS=60
exec "$design_scripts/../virtual-desktop-run.sh" "$design_scripts/scenario.sh" "$design_scripts/launch.sh" living-design
