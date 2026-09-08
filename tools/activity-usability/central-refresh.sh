#!/usr/bin/env bash
set -euo pipefail
export SWARM_ACTIVITY_CENTRAL_REFRESH=1
exec "$(dirname "$(readlink -f "$0")")/smoke.sh"
