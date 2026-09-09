#!/usr/bin/env bash
set -euo pipefail
[[ $# == 1 && "$1" == /* && -x "$1/bin/swarm" ]] || { echo "usage: bazel run //tools/cli:smoke -- /nix/store/PACKAGE" >&2; exit 2; }
cli_scripts=$(dirname "$(readlink -f "$0")")
export SWARM_INSTALLED_CLI="$1/bin/swarm"
if [[ "${SWARM_CLI_TEST_BARE:-}" == 1 ]]; then
  [[ -x "$1/bin/swarm-ide" ]] || { echo "missing swarm-ide command" >&2; exit 2; }
  export SWARM_INSTALLED_CLI="$1/bin/swarm-ide"
fi
export SWARM_SOURCE_WORKSPACE="${BUILD_WORKSPACE_DIRECTORY:?}"
export SWARM_ARTIFACT_DIR="${SWARM_ARTIFACT_DIR:-$(mktemp -d /tmp/swarm-installed-cli-proof.XXXXXX)}"
export SWARM_VIRTUAL_DESKTOP_PORT="${SWARM_VIRTUAL_DESKTOP_PORT:-55417}"
export SWARM_APP_START_TIMEOUT_MS=30000
export SWARM_SCENARIO_TIMEOUT_SECONDS=45
"$cli_scripts/../virtual-desktop-run.sh" "$cli_scripts/scenario.sh" "$cli_scripts/smoke-launch.sh" installed-cli
node "$cli_scripts/postclose.mjs"
