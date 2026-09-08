#!/usr/bin/env bash
set -euo pipefail
context_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?}"
exec node "$context_scripts/launch.mjs"
