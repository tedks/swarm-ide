#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
export SWARM_SOURCE_WORKSPACE=${BUILD_WORKSPACE_DIRECTORY:?}
: "${SWARM_FLEET_REGISTRY:?explicit real private registry required}"
export SWARM_VIRTUAL_DESKTOP_PORT=${SWARM_VIRTUAL_DESKTOP_PORT:-55401}
evidence_root=${SWARM_CONVERSATION_EVIDENCE:-$SWARM_SOURCE_WORKSPACE/artifacts/conversation-cockpit}
mkdir -p "$evidence_root"
export SWARM_ARTIFACT_DIR
SWARM_ARTIFACT_DIR=$(mktemp -d "$evidence_root/run.XXXXXX")
exec "$scripts/../virtual-desktop-run.sh" "$scripts/scenario.sh" "$scripts/launch.sh" conversation-cockpit
