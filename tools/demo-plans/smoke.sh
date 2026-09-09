#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then
  export RUNFILES_DIR
  RUNFILES_DIR=$(readlink -f "$0.runfiles")
fi
plans_scripts=$(dirname "$(readlink -f "$0")")
plans_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$plans_scripts")")}}
plans_artifacts=${SWARM_ARTIFACT_DIR:-${TEST_UNDECLARED_OUTPUTS_DIR:-$plans_source/artifacts}/demo-plans}
[[ "$plans_artifacts" == /* ]] || { echo 'Plans evidence directory must be absolute'; exit 2; }
mkdir -p "$plans_artifacts"
export SWARM_ARTIFACT_DIR
SWARM_ARTIFACT_DIR=$(mktemp -d "$plans_artifacts/run.XXXXXX")
export SWARM_PLANS_EVIDENCE="$SWARM_ARTIFACT_DIR"
export SWARM_PLANS_CASE="${SWARM_PLANS_CASE:-demo}"
[[ "$SWARM_PLANS_CASE" == demo || "$SWARM_PLANS_CASE" == swarm || "$SWARM_PLANS_CASE" == filters ]] || { echo 'Unknown plans proof case'; exit 2; }
# Archive materialization and CLI-authored fixtures precede port readiness.
export SWARM_APP_START_TIMEOUT_MS="${SWARM_APP_START_TIMEOUT_MS:-120000}"
# The proof's own 155-second bound must precede the supervisor's outer deadline.
export SWARM_SCENARIO_TIMEOUT_SECONDS="${SWARM_SCENARIO_TIMEOUT_SECONDS:-180}"
exec "$plans_scripts/../virtual-desktop-run.sh" "$plans_scripts/scenario.sh" "$plans_scripts/launch.sh" "demo-plans-$SWARM_PLANS_CASE"
