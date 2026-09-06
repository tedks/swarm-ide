#!/usr/bin/env bash
set -euo pipefail
rehearsal_dir=$(dirname "$(readlink -f "$0")")
rehearsal_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$rehearsal_dir")")}}
rehearsal_artifact_base=${SWARM_ARTIFACT_DIR:-${TEST_UNDECLARED_OUTPUTS_DIR:-$rehearsal_source/artifacts}/agent-rehearsal}
[[ "$rehearsal_artifact_base" == /* ]] || { echo 'Rehearsal evidence directory must be absolute'; exit 2; }
mkdir -p "$rehearsal_artifact_base"
# Never let an old successful (or failed) proof settle this invocation.
export SWARM_REHEARSAL_ARTIFACTS
SWARM_REHEARSAL_ARTIFACTS=$(mktemp -d "$rehearsal_artifact_base/run.XXXXXX")
export SWARM_ARTIFACT_DIR="$SWARM_REHEARSAL_ARTIFACTS"
exec "$rehearsal_dir/../virtual-desktop-run.sh" "$rehearsal_dir/scenario.sh" "$rehearsal_dir/virtual-launch.sh" agent-rehearsal
