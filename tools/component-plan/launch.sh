#!/usr/bin/env bash
set -euo pipefail
plan_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies the source workspace}"
exec node "$plan_scripts/launch.mjs"
