#!/usr/bin/env bash
set -euo pipefail
health_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?}"
exec node "$health_scripts/launch.mjs"
