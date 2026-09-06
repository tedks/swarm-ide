#!/usr/bin/env bash
set -euo pipefail
navigation_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies source workspace}"
exec node "$navigation_scripts/launch.mjs"
