#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_EXTERNAL_EVIDENCE:?}/window-selected"
deadline=$((SECONDS + 75))
while [[ ! -s "$SWARM_EXTERNAL_EVIDENCE/proof.json" ]]; do
  [[ ! -s "$SWARM_EXTERNAL_EVIDENCE/failure.json" ]] || { cat "$SWARM_EXTERNAL_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < deadline )) || { echo 'External observer proof timed out'; exit 1; }
  sleep 0.1
done
swarm_window_capture "$SWARM_EXTERNAL_EVIDENCE/window.png"
touch "$SWARM_EXTERNAL_EVIDENCE/close-request"
while [[ ! -s "$SWARM_EXTERNAL_EVIDENCE/postclose.json" ]]; do
  [[ ! -s "$SWARM_EXTERNAL_EVIDENCE/failure.json" ]] || { cat "$SWARM_EXTERNAL_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < deadline )) || { echo 'External observer close proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_EXTERNAL_EVIDENCE" <<'JS'
const fs = require('node:fs'), assert = require('node:assert/strict');
const root = process.argv[2], proof = JSON.parse(fs.readFileSync(root + '/proof.json'));
const close = JSON.parse(fs.readFileSync(root + '/postclose.json'));
assert(proof.ok && proof.synthetic && proof.packaged && proof.modelTurns === 0);
assert.deepEqual(proof.rendererErrors, []);
assert(close.observedProcessSurvivedAppClose && close.ownedTmuxCleaned);
console.log('Packaged external lineage/conversation/handoff passed with synthetic metadata and owned process survival.');
JS
