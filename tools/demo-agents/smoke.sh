#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
export SWARM_SOURCE_WORKSPACE=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:?}}
external_evidence_root=${SWARM_EXTERNAL_EVIDENCE:-$SWARM_SOURCE_WORKSPACE/artifacts/demo-agents}
mkdir -p "$external_evidence_root"
export SWARM_EXTERNAL_EVIDENCE
SWARM_EXTERNAL_EVIDENCE=$(mktemp -d "$external_evidence_root/run.XXXXXX")
export SWARM_ARTIFACT_DIR="$SWARM_EXTERNAL_EVIDENCE"
exec "$scripts/../virtual-desktop-run.sh" "$scripts/scenario.sh" "$scripts/launch.sh" demo-agents
