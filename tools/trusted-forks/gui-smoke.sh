#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
fork_scripts=$(dirname "$(readlink -f "$0")")
fork_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$fork_scripts")")}}
fork_artifacts=${SWARM_ARTIFACT_DIR:-$fork_source/artifacts/trusted-fork-gui-proof}
mkdir -p "$fork_artifacts"
export SWARM_ARTIFACT_DIR; SWARM_ARTIFACT_DIR=$(mktemp -d "$fork_artifacts/run.XXXXXX")
export SWARM_TRUSTED_EVIDENCE="$SWARM_ARTIFACT_DIR"
export SWARM_VIRTUAL_DISPLAY=${SWARM_VIRTUAL_DISPLAY:-:157}
export SWARM_VIRTUAL_DESKTOP_PORT=${SWARM_VIRTUAL_DESKTOP_PORT:-55237}
exec "$fork_scripts/../virtual-desktop-run.sh" "$fork_scripts/gui-scenario.sh" "$fork_scripts/gui-launch.sh" trusted-fork-gui-proof
