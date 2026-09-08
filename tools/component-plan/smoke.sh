#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
plan_scripts=$(dirname "$(readlink -f "$0")")
plan_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$plan_scripts")")}}
plan_artifacts=${SWARM_ARTIFACT_DIR:-$plan_source/artifacts/component-plan}
mkdir -p "$plan_artifacts"
export SWARM_ARTIFACT_DIR; SWARM_ARTIFACT_DIR=$(mktemp -d "$plan_artifacts/run.XXXXXX")
export SWARM_PLAN_UI_EVIDENCE="$SWARM_ARTIFACT_DIR"
export SWARM_VIRTUAL_DISPLAY=${SWARM_VIRTUAL_DISPLAY:-:184}
export SWARM_VIRTUAL_DESKTOP_PORT=${SWARM_VIRTUAL_DESKTOP_PORT:-55444}
exec "$plan_scripts/../virtual-desktop-run.sh" "$plan_scripts/scenario.sh" "$plan_scripts/launch.sh" component-plan-proof
