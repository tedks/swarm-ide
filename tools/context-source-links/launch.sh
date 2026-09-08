#!/usr/bin/env bash
set -euo pipefail
link_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies source workspace}"
exec node "$link_scripts/launch.mjs"
