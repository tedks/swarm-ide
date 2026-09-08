#!/usr/bin/env bash
set -euo pipefail
cd "${BUILD_WORKSPACE_DIRECTORY:?}"
exec node tools/build-graph/target-probe.mjs "$PWD/bazel-bin/tools/build-graph/target-probe.cjs" "$PWD/bazel-bin/swarm-ide-foundation.tar.gz"
