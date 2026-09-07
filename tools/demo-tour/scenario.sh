#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_TOUR_EVIDENCE:?}/window-selected"
tour_deadline=$((SECONDS + 195))
while [[ ! -s "$SWARM_TOUR_EVIDENCE/proof.json" ]]; do
  [[ ! -s "$SWARM_TOUR_EVIDENCE/failure.json" ]] || { cat "$SWARM_TOUR_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < tour_deadline )) || { echo 'Connected tour timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_TOUR_EVIDENCE/proof.json" <<'JS'
const p = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (!p.ok || !p.actualTaskMetadata || !p.prepared || !p.retained || p.productMutations.length || p.blockingErrors.length) process.exit(1);
console.log('Actual Swarm source + Ditz -> Plan -> fixed draft -> Prepare -> recorded Activity. No model turn.');
console.log('Accepted exact resize diagnostics:', p.acceptedResizeWarnings.length);
JS
swarm_window_capture "$SWARM_TOUR_EVIDENCE/tour-window.png"
