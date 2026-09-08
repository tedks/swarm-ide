#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
export SWARM_CONTAINER_SOURCE_ROOT=${BUILD_WORKSPACE_DIRECTORY:?Run through Bazel}
node --test "$scripts/checks.test.mjs"
