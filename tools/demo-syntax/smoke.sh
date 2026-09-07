#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then
  export RUNFILES_DIR
  RUNFILES_DIR=$(readlink -f "$0.runfiles")
fi
syntax_scripts=$(dirname "$(readlink -f "$0")")
syntax_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$syntax_scripts")")}}
syntax_artifacts=${SWARM_ARTIFACT_DIR:-$syntax_source/artifacts/demo-syntax}
[[ "$syntax_artifacts" == /* ]] || { echo 'Syntax evidence directory must be absolute'; exit 2; }
mkdir -p "$syntax_artifacts"
export SWARM_ARTIFACT_DIR
SWARM_ARTIFACT_DIR=$(mktemp -d "$syntax_artifacts/run.XXXXXX")
export SWARM_SYNTAX_EVIDENCE="$SWARM_ARTIFACT_DIR"
export SWARM_VIRTUAL_DISPLAY=${SWARM_VIRTUAL_DISPLAY:-:137}
export SWARM_VIRTUAL_DESKTOP_PORT=${SWARM_VIRTUAL_DESKTOP_PORT:-55217}
export SWARM_APP_START_TIMEOUT_MS=60000
export SWARM_SCENARIO_TIMEOUT_SECONDS=100
exec "$syntax_scripts/../virtual-desktop-run.sh" "$syntax_scripts/scenario.sh" "$syntax_scripts/launch.sh" demo-syntax
