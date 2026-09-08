#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
export SWARM_SOURCE_WORKSPACE=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:?}}
live_evidence_root=${SWARM_LIVE_EVIDENCE:-$SWARM_SOURCE_WORKSPACE/artifacts/live-observers}
mkdir -p "$live_evidence_root"
export SWARM_LIVE_EVIDENCE
SWARM_LIVE_EVIDENCE=$(mktemp -d "$live_evidence_root/run.XXXXXX")
export SWARM_ARTIFACT_DIR="$SWARM_LIVE_EVIDENCE"
exec "$scripts/../virtual-desktop-run.sh" "$scripts/scenario.sh" "$scripts/launch.sh" live-observers
