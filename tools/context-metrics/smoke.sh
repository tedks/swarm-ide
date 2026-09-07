#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
context_scripts=$(dirname "$(readlink -f "$0")")
context_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$context_scripts")")}}
context_artifacts=${SWARM_ARTIFACT_DIR:-${TEST_UNDECLARED_OUTPUTS_DIR:-$context_source/artifacts}/context-metrics}
mkdir -p "$context_artifacts"
export SWARM_ARTIFACT_DIR
SWARM_ARTIFACT_DIR=$(mktemp -d "$context_artifacts/run.XXXXXX")
export SWARM_CONTEXT_EVIDENCE="$SWARM_ARTIFACT_DIR"
export SWARM_APP_START_TIMEOUT_MS=120000 SWARM_SCENARIO_TIMEOUT_SECONDS=120
exec "$context_scripts/../virtual-desktop-run.sh" "$context_scripts/scenario.sh" "$context_scripts/launch.sh" context-metrics
