#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
startup_scripts=$(dirname "$(readlink -f "$0")")
export SWARM_STARTUP_BUILD_PROOF=1 SWARM_BUILD_GRAPH_CASE=first
startup_artifacts=${SWARM_ARTIFACT_DIR:-${BUILD_WORKSPACE_DIRECTORY:?}/artifacts/build-startup}
mkdir -p "$startup_artifacts"
export SWARM_BUILD_GRAPH_EVIDENCE
SWARM_BUILD_GRAPH_EVIDENCE=$(mktemp -d "$startup_artifacts/run.XXXXXX")
export SWARM_ARTIFACT_DIR="$SWARM_BUILD_GRAPH_EVIDENCE"
"$startup_scripts/../virtual-desktop-run.sh" "$startup_scripts/scenario.sh" "$startup_scripts/launch.sh" "build-startup"
grep -q 'cleanup_complete=1 ' "$SWARM_ARTIFACT_DIR/supervisor.log"
