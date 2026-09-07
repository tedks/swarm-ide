#!/usr/bin/env bash
set -euo pipefail
service_scripts=$(dirname "$(readlink -f "$0")")
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
service_repository=$(node "$service_scripts/fixture.mjs")
unset SWARM_RENDERER_URL SWARM_DEV_CONTROL SWARM_AGENT_STORE_ROOT SWARM_EXTERNAL_AGENTS_REGISTRY
export VITE_SWARM_AGENT_DEMO=0
exec "$service_scripts/../dev.sh" --workspace "$service_repository"
