#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
activity_scripts=$(dirname "$(readlink -f "$0")")
activity_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$activity_scripts")")}}
activity_artifacts=${SWARM_ARTIFACT_DIR:-$activity_source/artifacts/activity-prs-proof}
mkdir -p "$activity_artifacts"
export SWARM_ARTIFACT_DIR; SWARM_ARTIFACT_DIR=$(mktemp -d "$activity_artifacts/run.XXXXXX")
export SWARM_ACTIVITY_EVIDENCE="$SWARM_ARTIFACT_DIR"
exec "$activity_scripts/../virtual-desktop-run.sh" "$activity_scripts/scenario.sh" "$activity_scripts/launch.sh" activity-prs-proof
