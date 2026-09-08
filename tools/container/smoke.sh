#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Run through Bazel}"
exec node "$scripts/smoke.mjs"
