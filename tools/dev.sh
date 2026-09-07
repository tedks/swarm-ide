#!/usr/bin/env bash
set -euo pipefail

export SWARM_DEV_INVOKED_FROM="${BUILD_WORKING_DIRECTORY:-$PWD}"
workspace="${BUILD_WORKSPACE_DIRECTORY:-}"
if [[ -z "$workspace" ]]; then
  script_path=$(readlink -f "$0")
  workspace=$(cd "$(dirname "$script_path")/.." && pwd)
fi

cd "$workspace"
exec node "$workspace/tools/dev-entry.mjs" "$@"
