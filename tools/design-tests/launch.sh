#!/usr/bin/env bash
set -euo pipefail
design_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies source workspace}"
exec node "$design_scripts/launch.mjs"
