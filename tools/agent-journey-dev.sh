#!/usr/bin/env bash
set -euo pipefail
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness must supply the workspace}"
exec node tools/agent-journey-dev.mjs
