#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
export SWARM_STATUS_PROOF=1
: "${SWARM_STATUS_WORK_LOG:?explicit existing saved Work Log required; copied only to owned proof workspace}"
exec "$scripts/fleet-smoke.sh"
