#!/usr/bin/env bash
set -euo pipefail
fork_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies the source workspace}"
exec node "$fork_scripts/gui-launch.mjs"
