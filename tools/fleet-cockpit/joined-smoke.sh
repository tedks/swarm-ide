#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
trusted_scripts=$(dirname "$(readlink -f "$0")")
trusted_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$trusted_scripts")")}}
trusted_artifacts=${SWARM_ARTIFACT_DIR:-$trusted_source/artifacts/joined-fleet-proof}
mkdir -p "$trusted_artifacts"
export SWARM_ARTIFACT_DIR; SWARM_ARTIFACT_DIR=$(mktemp -d "$trusted_artifacts/run.XXXXXX")
export SWARM_TRUSTED_EVIDENCE="$SWARM_ARTIFACT_DIR"
export SWARM_VIRTUAL_DISPLAY=${SWARM_VIRTUAL_DISPLAY:-:152}
export SWARM_VIRTUAL_DESKTOP_PORT=${SWARM_VIRTUAL_DESKTOP_PORT:-55232}
exec "$trusted_scripts/../virtual-desktop-run.sh" "$trusted_scripts/joined-scenario.sh" "$trusted_scripts/joined-launch.sh" joined-fleet-proof

