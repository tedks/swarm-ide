#!/usr/bin/env bash
set -euo pipefail
resources_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies source workspace}"
exec node "$resources_scripts/launch.mjs"
