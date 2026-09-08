#!/usr/bin/env bash
set -euo pipefail
service_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies source workspace}"
exec node "$service_scripts/launch.mjs"
