#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_PLANS_EVIDENCE:?}/window-selected"
actions_deadline=$((SECONDS + 100))
while [[ ! -s "$SWARM_PLANS_EVIDENCE/actions-proof.json" ]]; do
  [[ ! -s "$SWARM_PLANS_EVIDENCE/actions-failure.json" ]] || { cat "$SWARM_PLANS_EVIDENCE/actions-failure.json"; exit 1; }
  (( SECONDS < actions_deadline )) || { echo 'Packaged plan actions proof timed out'; exit 1; }
  sleep 0.1
done
actions_scripts=$(dirname "$(readlink -f "$0")")
node - "$SWARM_PLANS_EVIDENCE/actions-proof.json" "$actions_scripts/../demo-plans/diagnostics.cjs" <<'JS'
const fs = require('node:fs');
const proof = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const diagnostics = require(process.argv[3]).validatePlansProof(proof);
if (!proof.primaryControlsVisibleAfterScroll || !proof.sourceDraftCamerasRetained) throw new Error('Missing action/retention proof');
console.log('Real disposable authored index and CLI tasks exercised selected-plan actions through packaged core and native UI.');
console.log(`Exact accepted resize warnings: ${diagnostics.acceptedResizeWarnings.length}; other renderer errors: 0.`);
JS
swarm_window_capture "$SWARM_PLANS_EVIDENCE/actions-window.png"
