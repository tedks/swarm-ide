#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
export SWARM_SOURCE_WORKSPACE=${BUILD_WORKSPACE_DIRECTORY:?}
: "${SWARM_FLEET_REGISTRY:?explicit real private registry required}"
: "${SWARM_ARTIFACT_DIR:?owned evidence directory required}"
exec "$scripts/../virtual-desktop-run.sh" "$scripts/fleet-scenario.sh" "$scripts/fleet-launch.sh" live-fleet
