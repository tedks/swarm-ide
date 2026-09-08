#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
link_scripts=$(dirname "$(readlink -f "$0")")
link_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$link_scripts")")}}
link_artifacts=${SWARM_ARTIFACT_DIR:-$link_source/artifacts/context-source-links}
mkdir -p "$link_artifacts"
export SWARM_ARTIFACT_DIR
SWARM_ARTIFACT_DIR=$(mktemp -d "$link_artifacts/run.XXXXXX")
export SWARM_LINK_EVIDENCE="$SWARM_ARTIFACT_DIR"
export SWARM_VIRTUAL_DESKTOP_PORT=${SWARM_VIRTUAL_DESKTOP_PORT:-55402}
export SWARM_APP_START_TIMEOUT_MS=120000 SWARM_SCENARIO_TIMEOUT_SECONDS=120
exec "$link_scripts/../virtual-desktop-run.sh" "$link_scripts/scenario.sh" "$link_scripts/launch.sh" context-source-links
