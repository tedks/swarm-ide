#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
target_scripts=$(dirname "$(readlink -f "$0")")
export SWARM_BUILD_GRAPH_EVIDENCE=${SWARM_ARTIFACT_DIR:?Provide an owned evidence directory}
export SWARM_BUILD_GRAPH_CASE=first SWARM_SELECTED_BUILD_PROOF=1
mkdir -p "$SWARM_BUILD_GRAPH_EVIDENCE"
"$target_scripts/../virtual-desktop-run.sh" "$target_scripts/scenario.sh" "$target_scripts/launch.sh" selected-target-build
grep -q 'cleanup_complete=1 ' "$SWARM_ARTIFACT_DIR/supervisor.log"
