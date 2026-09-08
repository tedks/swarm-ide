#!/usr/bin/env bash
set -euo pipefail
supervisor_scripts=$(dirname "$(readlink -f "$0")")
if [[ -n "${BUILD_WORKSPACE_DIRECTORY:-}" ]]; then cd "$BUILD_WORKSPACE_DIRECTORY"; fi
exec node "$supervisor_scripts/supervisor.mjs" "$@"
