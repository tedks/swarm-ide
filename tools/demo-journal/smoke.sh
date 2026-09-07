#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
journal_scripts=$(dirname "$(readlink -f "$0")")
journal_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$journal_scripts")")}}
[[ "${SWARM_JOURNAL_AUTHORING_PROOF:-}" == /* ]] || { echo 'Set SWARM_JOURNAL_AUTHORING_PROOF to the explicit supervised-authoring evidence directory'; exit 2; }
journal_artifacts=${SWARM_ARTIFACT_DIR:-$journal_source/artifacts/journal-proof}
mkdir -p "$journal_artifacts"
export SWARM_ARTIFACT_DIR; SWARM_ARTIFACT_DIR=$(mktemp -d "$journal_artifacts/run.XXXXXX")
export SWARM_JOURNAL_EVIDENCE="$SWARM_ARTIFACT_DIR"
exec "$journal_scripts/../virtual-desktop-run.sh" "$journal_scripts/scenario.sh" "$journal_scripts/launch.sh" journal-proof
