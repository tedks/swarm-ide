#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
health_scripts=$(dirname "$(readlink -f "$0")")
export SWARM_HEALTH_EVIDENCE
SWARM_HEALTH_EVIDENCE=$(mktemp -d "${SWARM_ARTIFACT_DIR:-/tmp}/renderer-health.XXXXXX")
export SWARM_ARTIFACT_DIR="$SWARM_HEALTH_EVIDENCE"
printf 'Renderer health evidence: %s\n' "$SWARM_HEALTH_EVIDENCE"
"$health_scripts/../virtual-desktop-run.sh" "$health_scripts/scenario.sh" "$health_scripts/launch.sh" renderer-health
grep -q 'cleanup_complete=1 ' "$SWARM_ARTIFACT_DIR/supervisor.log"
