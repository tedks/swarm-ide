#!/usr/bin/env bash
set -euo pipefail
tour_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies source workspace}"
exec node "$tour_scripts/launch.mjs"
