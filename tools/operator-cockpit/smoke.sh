#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then
  export RUNFILES_DIR
  RUNFILES_DIR=$(readlink -f "$0.runfiles")
fi
cockpit_scripts=$(dirname "$(readlink -f "$0")")
cockpit_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:?Run through Bazel}}
cockpit_artifacts=${SWARM_ARTIFACT_DIR:-$cockpit_source/artifacts/operator-cockpit}
[[ "$cockpit_artifacts" == /* ]] || { echo 'Evidence directory must be absolute'; exit 2; }
mkdir -p "$cockpit_artifacts"
export SWARM_ARTIFACT_DIR
SWARM_ARTIFACT_DIR=$(mktemp -d "$cockpit_artifacts/run.XXXXXX")
export SWARM_COCKPIT_EVIDENCE="$SWARM_ARTIFACT_DIR"
# The operator supplies a private registry and a real, already-running session.
# No transcript is manufactured and the shared registry is never edited.
if [[ ${SWARM_COCKPIT_TABS_ONLY:-0} != 1 && ${SWARM_COCKPIT_WORKLOG_ONLY:-0} != 1 && ${SWARM_COCKPIT_PLAN_ONLY:-0} != 1 ]]; then
  : "${SWARM_COCKPIT_REGISTRY:?Supply an existing private operator registry}"
  : "${SWARM_COCKPIT_SESSION:?Supply an existing registered session ID}"
fi
export SWARM_VIRTUAL_DESKTOP_PORT=${SWARM_VIRTUAL_DESKTOP_PORT:-55332}
export SWARM_APP_START_TIMEOUT_MS=60000
export SWARM_SCENARIO_TIMEOUT_SECONDS=100
exec "$cockpit_scripts/../virtual-desktop-run.sh" "$cockpit_scripts/scenario.sh" "$cockpit_scripts/launch.sh" operator-cockpit
