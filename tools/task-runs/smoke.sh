#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
scripts=$(dirname "$(readlink -f "$0")")
task_runs_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$scripts")")}}
task_runs_artifacts=${SWARM_ARTIFACT_DIR:-$task_runs_source/artifacts/task-runs}
[[ "$task_runs_artifacts" == /* ]] || { echo 'Absolute evidence directory required'; exit 2; }
mkdir -p "$task_runs_artifacts"
export SWARM_ARTIFACT_DIR; SWARM_ARTIFACT_DIR=$(mktemp -d "$task_runs_artifacts/run.XXXXXX")
export SWARM_TASK_RUNS_EVIDENCE="$SWARM_ARTIFACT_DIR"
export SWARM_VIRTUAL_DISPLAY=${SWARM_VIRTUAL_DISPLAY:-:155}
export SWARM_VIRTUAL_DESKTOP_PORT=${SWARM_VIRTUAL_DESKTOP_PORT:-55235}
export SWARM_SCENARIO_TIMEOUT_SECONDS=90
exec "$scripts/../virtual-desktop-run.sh" "$scripts/scenario.sh" "$scripts/launch.sh" task-runs-controlled
