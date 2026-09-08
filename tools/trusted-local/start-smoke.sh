#!/usr/bin/env bash
set -euo pipefail
export SWARM_TRUSTED_START_PROOF=1
export SWARM_VIRTUAL_DISPLAY=${SWARM_VIRTUAL_DISPLAY:-:181}
export SWARM_VIRTUAL_DESKTOP_PORT=${SWARM_VIRTUAL_DESKTOP_PORT:-55441}
exec "$(dirname "$(readlink -f "$0")")/smoke.sh"
