#!/usr/bin/env bash
set -euo pipefail
sprite_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?}"
exec node "$sprite_scripts/launch.mjs"
