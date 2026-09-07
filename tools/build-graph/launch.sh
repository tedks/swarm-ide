#!/usr/bin/env bash
set -euo pipefail
build_graph_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies source workspace}"
exec node "$build_graph_scripts/launch.mjs"
