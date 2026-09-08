#!/usr/bin/env bash
set -euo pipefail
sprite_scripts=$(dirname "$(readlink -f "$0")")
export SWARM_SOURCE_WORKSPACE=${BUILD_WORKSPACE_DIRECTORY:?}
: "${SWARM_SPRITE_REGISTRY:?Supply the existing private registry}"
: "${SWARM_SPRITE_SESSION:?Supply an existing observed session}"
: "${SWARM_ARTIFACT_DIR:?Supply an owned evidence directory}"
export SWARM_VIRTUAL_DESKTOP_PORT=${SWARM_VIRTUAL_DESKTOP_PORT:-55421}
export SWARM_APP_START_TIMEOUT_MS=60000
export SWARM_SCENARIO_TIMEOUT_SECONDS=100
exec "$sprite_scripts/../virtual-desktop-run.sh" "$sprite_scripts/scenario.sh" "$sprite_scripts/launch.sh" live-sprites
