#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
export SWARM_SOURCE_WORKSPACE=${BUILD_WORKSPACE_DIRECTORY:?}
: "${SWARM_FLEET_REGISTRY:?explicit read-only registry required}"
export SWARM_VIRTUAL_DESKTOP_PORT=${SWARM_VIRTUAL_DESKTOP_PORT:-55419}
mkdir -p "${SWARM_OUTBOX_EVIDENCE:-$SWARM_SOURCE_WORKSPACE/artifacts/message-outbox}"
export SWARM_ARTIFACT_DIR
SWARM_ARTIFACT_DIR=$(mktemp -d "${SWARM_OUTBOX_EVIDENCE:-$SWARM_SOURCE_WORKSPACE/artifacts/message-outbox}/run.XXXXXX")
exec "$scripts/../virtual-desktop-run.sh" "$scripts/scenario.sh" "$scripts/launch.sh" message-outbox
