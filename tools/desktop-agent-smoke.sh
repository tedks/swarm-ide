#!/usr/bin/env bash
set -euo pipefail
umask 077
script_dir=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
workspace=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$script_dir")}}
export SWARM_ARTIFACT_DIR=${SWARM_ARTIFACT_DIR:-${TEST_UNDECLARED_OUTPUTS_DIR:-$workspace/artifacts}/agent-journey}
export SWARM_JOURNEY_ARTIFACTS="$SWARM_ARTIFACT_DIR"
exec "$script_dir/virtual-desktop-run.sh" "$script_dir/desktop-agent-scenario.sh" "$script_dir/agent-journey-dev.sh" agent-journey
