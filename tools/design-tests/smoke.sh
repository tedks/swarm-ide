#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then
  export RUNFILES_DIR
  RUNFILES_DIR=$(readlink -f "$0.runfiles")
fi
design_scripts=$(dirname "$(readlink -f "$0")")
design_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$design_scripts")")}}
design_artifacts=${SWARM_ARTIFACT_DIR:-$design_source/artifacts/design-tests}
[[ "$design_artifacts" == /* ]] || { echo 'Design test evidence directory must be absolute'; exit 2; }
mkdir -p "$design_artifacts"
export SWARM_ARTIFACT_DIR
SWARM_ARTIFACT_DIR=$(mktemp -d "$design_artifacts/run.XXXXXX")
export SWARM_DESIGN_TESTS_EVIDENCE="$SWARM_ARTIFACT_DIR"
# The shared supervisor atomically allocates a nonzero display and refuses an
# occupied port; this proof never uses an inherited physical desktop display.
export SWARM_VIRTUAL_DESKTOP_PORT="${SWARM_VIRTUAL_DESKTOP_PORT:-55377}"
export SWARM_APP_START_TIMEOUT_MS=90000
export SWARM_SCENARIO_TIMEOUT_SECONDS=150
"$design_scripts/../virtual-desktop-run.sh" "$design_scripts/scenario.sh" "$design_scripts/launch.sh" design-tests
grep -q 'cleanup_complete=1 ' "$SWARM_ARTIFACT_DIR/supervisor.log"
