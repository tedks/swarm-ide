#!/usr/bin/env bash
set -euo pipefail
cd "${BUILD_WORKSPACE_DIRECTORY:?}"
exec node tools/build-graph/progress-probe.mjs "$PWD/bazel-bin/tools/build-graph/progress-probe.cjs" "$PWD/bazel-bin/swarm-ide-foundation.tar.gz" "$(command -v unshare)" "$(command -v setpriv)"
