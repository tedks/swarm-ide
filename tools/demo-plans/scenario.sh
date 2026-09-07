#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
# Only the supervisor's exact owned native window may release UI acceptance.
touch "${SWARM_PLANS_EVIDENCE:?}/window-selected"
plans_deadline=$((SECONDS + 155))
while [[ ! -s "$SWARM_PLANS_EVIDENCE/plans-proof.json" ]]; do
  [[ ! -s "$SWARM_PLANS_EVIDENCE/plans-failure.json" ]] || { cat "$SWARM_PLANS_EVIDENCE/plans-failure.json"; exit 1; }
  (( SECONDS < plans_deadline )) || { echo 'Packaged plans proof timed out'; exit 1; }
  sleep 0.1
done
plans_scripts=$(dirname "$(readlink -f "$0")")
node - "$SWARM_PLANS_EVIDENCE/plans-proof.json" "$plans_scripts/diagnostics.cjs" <<'JS'
const fs = require('node:fs');
const proof = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const diagnostics = require(process.argv[3]).validatePlansProof(proof);
console.log('Authored plans and real CLI-authored tasks passed through the packaged core, bridge and UI; no model turn.');
console.log(`Preserved ${diagnostics.acceptedResizeWarnings.length} exact user-accepted resize warnings; zero other renderer errors.`);
JS
swarm_window_capture "$SWARM_PLANS_EVIDENCE/plans-window.png"
