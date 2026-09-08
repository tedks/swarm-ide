#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
export SWARM_SOURCE_WORKSPACE=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:?}}
export SWARM_VIRTUAL_DISPLAY=${SWARM_VIRTUAL_DISPLAY:-:154}
export SWARM_VIRTUAL_DESKTOP_PORT=${SWARM_VIRTUAL_DESKTOP_PORT:-55234}
steering_evidence_root=${SWARM_STEERING_EVIDENCE:-$SWARM_SOURCE_WORKSPACE/artifacts/session-steering}
mkdir -p "$steering_evidence_root"
export SWARM_STEERING_EVIDENCE
SWARM_STEERING_EVIDENCE=$(mktemp -d "$steering_evidence_root/run.XXXXXX")
export SWARM_ARTIFACT_DIR="$SWARM_STEERING_EVIDENCE"
exec "$scripts/../virtual-desktop-run.sh" "$scripts/scenario.sh" "$scripts/launch.sh" session-steering
