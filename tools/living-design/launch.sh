#!/usr/bin/env bash
set -euo pipefail
design_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?}"
exec node "$design_scripts/launch.mjs"
