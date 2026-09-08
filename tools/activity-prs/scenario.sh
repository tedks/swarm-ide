#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_ACTIVITY_EVIDENCE:?}/window-selected"
activity_deadline=$((SECONDS + 75))
while [[ ! -s "$SWARM_ACTIVITY_EVIDENCE/proof.json" ]]; do
  [[ ! -s "$SWARM_ACTIVITY_EVIDENCE/failure.json" ]] || { cat "$SWARM_ACTIVITY_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < activity_deadline )) || { echo 'Activity packaged proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_ACTIVITY_EVIDENCE/proof.json" <<'JS'
const proof = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (!proof.ok || !proof.realGithub || !proof.packagedCore || proof.modelTurns !== 0 || proof.rendererErrors.length) process.exit(1);
console.log('Actual GitHub PRs crossed the packaged bridge; source/draft/cameras retained.');
JS
swarm_window_capture "$SWARM_ACTIVITY_EVIDENCE/activity-window.png"
touch "$SWARM_ACTIVITY_EVIDENCE/close-request"
