#!/usr/bin/env bash
set -euo pipefail
export RUNFILES_DIR=${RUNFILES_DIR:-$(readlink -f "$0.runfiles")}
rehearsal_script=$(readlink -f "$0")
rehearsal_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$(dirname "$rehearsal_script")")")}}
cd "$rehearsal_source"
exec node tools/agent-rehearsal/launch.mjs "$@"
