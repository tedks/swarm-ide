#!/usr/bin/env bash
set -euo pipefail
activity_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies source workspace}"
exec node "$activity_scripts/launch.mjs"
