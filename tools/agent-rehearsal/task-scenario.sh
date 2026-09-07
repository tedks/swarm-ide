#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_TASK_REHEARSAL_EVIDENCE:?}/window-selected"
task_rehearsal_deadline=$((SECONDS + 110))
while [[ ! -s "$SWARM_TASK_REHEARSAL_EVIDENCE/task-rehearsal.json" ]]; do
  [[ ! -s "$SWARM_TASK_REHEARSAL_EVIDENCE/task-rehearsal-failure.json" ]] || { cat "$SWARM_TASK_REHEARSAL_EVIDENCE/task-rehearsal-failure.json"; exit 1; }
  (( SECONDS < task_rehearsal_deadline )) || { echo 'Task rehearsal proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_TASK_REHEARSAL_EVIDENCE/task-rehearsal.json" <<'JS'
const proof = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (!proof.ok || !proof.fixtureOnly || proof.modelTurns !== 0 || !proof.shutdown.drained || !proof.shutdown.disposed || proof.ledger.overflow) process.exit(1);
console.log('Task-bearing deterministic rehearsal passed actual UI/real resolver/history/recovery; no model.');
JS
