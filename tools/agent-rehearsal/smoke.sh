#!/usr/bin/env bash
set -euo pipefail
rehearsal_dir=$(dirname "$(readlink -f "$0")")
rehearsal_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$rehearsal_dir")")}}
export SWARM_REHEARSAL_ARTIFACTS=${SWARM_ARTIFACT_DIR:-${TEST_UNDECLARED_OUTPUTS_DIR:-$rehearsal_source/artifacts}/agent-rehearsal}
export SWARM_ARTIFACT_DIR="$SWARM_REHEARSAL_ARTIFACTS"
mkdir -p "$SWARM_REHEARSAL_ARTIFACTS"
exec "$rehearsal_dir/../virtual-desktop-run.sh" "$rehearsal_dir/scenario.sh" "$rehearsal_dir/virtual-launch.sh" agent-rehearsal
