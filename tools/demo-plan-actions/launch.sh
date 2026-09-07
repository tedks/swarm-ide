#!/usr/bin/env bash
set -euo pipefail
actions_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies source workspace}"
exec node "$actions_scripts/launch.mjs"
