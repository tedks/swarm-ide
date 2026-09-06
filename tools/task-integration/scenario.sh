#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
# Native ownership has been verified before any Electron-driven input is allowed.
touch "${SWARM_TASK_EVIDENCE:?}/window-selected"
task_deadline=$((SECONDS + 100))
while [[ ! -s "$SWARM_TASK_EVIDENCE/task-proof.json" ]]; do
  [[ ! -s "$SWARM_TASK_EVIDENCE/task-failure.json" ]] || { cat "$SWARM_TASK_EVIDENCE/task-failure.json"; exit 1; }
  (( SECONDS < task_deadline )) || { echo 'Packaged task proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_TASK_EVIDENCE/task-proof.json" <<'JS'
const fs = require('node:fs');
const proof = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!proof.ok || !proof.realDitz || !proof.packagedCore || proof.modelTurns !== 0) process.exit(1);
console.log('Real CLI-authored tasks passed through actual packaged core, bridge and UI; no model turn.');
JS
swarm_window_capture "$SWARM_TASK_EVIDENCE/task-window.png"
