#!/usr/bin/env bash
set -euo pipefail
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies workspace}"
exec node tools/agent-rehearsal/launch.mjs --owned-virtual-acceptance --workspace "$BUILD_WORKSPACE_DIRECTORY"
