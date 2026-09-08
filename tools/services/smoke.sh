#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
service_scripts=$(dirname "$(readlink -f "$0")")
export SWARM_SERVICE_EVIDENCE=${SWARM_ARTIFACT_DIR:-$(mktemp -d /tmp/swarm-service-proof.XXXXXX)}
export SWARM_ARTIFACT_DIR="$SWARM_SERVICE_EVIDENCE"
mkdir -p "$SWARM_SERVICE_EVIDENCE"
"$service_scripts/../virtual-desktop-run.sh" "$service_scripts/scenario.sh" "$service_scripts/launch.sh" declared-services
grep -q 'cleanup_complete=1 ' "$SWARM_ARTIFACT_DIR/supervisor.log"
