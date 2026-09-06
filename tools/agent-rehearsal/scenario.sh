#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
rehearsal_deadline=$((SECONDS + 110))
while [[ ! -s "${SWARM_REHEARSAL_ARTIFACTS:?}/rehearsal.json" ]]; do
  [[ ! -s "$SWARM_REHEARSAL_ARTIFACTS/rehearsal-failure.json" ]] || { echo 'Rehearsal ordinary-UI proof failed'; exit 1; }
  [[ ! -s "$SWARM_REHEARSAL_ARTIFACTS/rehearsal-bootstrap-failure.json" ]] || { echo 'Rehearsal bootstrap/close proof failed'; exit 1; }
  (( SECONDS < rehearsal_deadline )) || { echo 'Rehearsal proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_REHEARSAL_ARTIFACTS/rehearsal.json" <<'JS'
const fs = require('node:fs');
const evidence = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!evidence.ok || !evidence.shutdown.drained || evidence.ledger.overflow || !evidence.fixtureOnly) process.exit(1);
console.log('Ordinary-UI rehearsal passed; actual runtime shutdown acknowledged; in-process fixture only.');
JS
