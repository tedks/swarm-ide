#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then
  export RUNFILES_DIR
  RUNFILES_DIR=$(readlink -f "$0.runfiles")
fi
navigation_scripts=$(dirname "$(readlink -f "$0")")
navigation_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$navigation_scripts")")}}
navigation_artifacts=${SWARM_ARTIFACT_DIR:-${TEST_UNDECLARED_OUTPUTS_DIR:-$navigation_source/artifacts}/repository-navigation}
[[ "$navigation_artifacts" == /* ]] || { echo 'Navigation evidence directory must be absolute'; exit 2; }
mkdir -p "$navigation_artifacts"
navigation_run=$(mktemp -d "$navigation_artifacts/run.XXXXXX")
navigation_status=0
for navigation_case in swarm unfamiliar invalid-name fingerprint-budget; do
  export SWARM_NAVIGATION_CASE="$navigation_case"
  export SWARM_NAVIGATION_EVIDENCE="$navigation_run/$navigation_case"
  export SWARM_ARTIFACT_DIR="$SWARM_NAVIGATION_EVIDENCE"
  mkdir -p "$SWARM_NAVIGATION_EVIDENCE"
  if ! "$navigation_scripts/../virtual-desktop-run.sh" "$navigation_scripts/scenario.sh" "$navigation_scripts/launch.sh" "navigation-$navigation_case"; then
    navigation_status=1
  fi
  # A failed case is still a failed aggregate. Independent cases may continue
  # only after the existing owner has proved its full desktop/process cleanup.
  grep -q 'cleanup_complete=1 ' "$SWARM_NAVIGATION_EVIDENCE/supervisor.log"
done
(( navigation_status == 0 )) || { echo "Packaged navigation failed; all available case evidence: $navigation_run"; exit 1; }
echo "Packaged repository navigation passed all four real filesystem cases: $navigation_run"
