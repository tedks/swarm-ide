#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
recenter_scripts=$(dirname "$(readlink -f "$0")")
recenter_evidence_root=${SWARM_ARTIFACT_DIR:-$(mktemp -d /tmp/swarm-recenter-proof.XXXXXX)}
mkdir -p "$recenter_evidence_root"
export SWARM_RECENTER_EVIDENCE
SWARM_RECENTER_EVIDENCE=$(mktemp -d "$recenter_evidence_root/run.XXXXXX")
export SWARM_ARTIFACT_DIR="$SWARM_RECENTER_EVIDENCE"
printf 'Fresh graph recenter evidence: %s\n' "$SWARM_RECENTER_EVIDENCE"
"$recenter_scripts/../virtual-desktop-run.sh" "$recenter_scripts/scenario.sh" "$recenter_scripts/launch.sh" graph-recenter
grep -q 'cleanup_complete=1 ' "$SWARM_ARTIFACT_DIR/supervisor.log"
