#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies workspace}"
exec node "$scripts/launch.mjs"
