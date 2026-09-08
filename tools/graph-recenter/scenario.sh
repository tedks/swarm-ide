#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_RECENTER_EVIDENCE:?}/window-selected"
recenter_deadline=$((SECONDS + 75))
while [[ ! -s "$SWARM_RECENTER_EVIDENCE/proof.json" ]]; do
  if [[ -s "$SWARM_RECENTER_EVIDENCE/failure.json" ]]; then cat "$SWARM_RECENTER_EVIDENCE/failure.json"; exit 1; fi
  (( SECONDS < recenter_deadline )) || { echo 'Graph recenter proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_RECENTER_EVIDENCE/proof.json" <<'JS'
const proof = JSON.parse(require('node:fs').readFileSync(process.argv[2]));
if (!proof.ok || proof.rendererErrors.length || !proof.retained) process.exit(1);
console.log(`Graph recenter passed in ${proof.elapsedMs}ms: ${proof.gestures.join(', ')}`);
JS
