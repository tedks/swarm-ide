#!/usr/bin/env bash
set -euo pipefail
cd "${BUILD_WORKSPACE_DIRECTORY:?}"
exec node tools/build-graph/automatic-probe.mjs "$PWD/bazel-bin/tools/build-graph/probe.cjs" "$PWD/bazel-bin/swarm-ide-foundation.tar.gz"
