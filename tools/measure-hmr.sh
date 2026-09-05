#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
workspace="${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-}}"
[[ -n "$workspace" ]] || workspace=$(cd "$script_dir/.." && pwd)
export SWARM_SCENARIO_RESTORE_PATH="$(readlink -f "$workspace/app/renderer/hmr-probe.css")"
exec "$script_dir/virtual-desktop-run.sh" \
  "$script_dir/hmr-scenario.sh" \
  "$script_dir/dev.sh" \
  hmr-smoke
