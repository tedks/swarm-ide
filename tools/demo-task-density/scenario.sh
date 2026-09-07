#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_DENSITY_EVIDENCE:?}/window-selected"
density_deadline=$((SECONDS + 90))
while [[ ! -s "$SWARM_DENSITY_EVIDENCE/density-proof.json" ]]; do
  [[ ! -s "$SWARM_DENSITY_EVIDENCE/density-failure.json" ]] || { cat "$SWARM_DENSITY_EVIDENCE/density-failure.json"; exit 1; }
  (( SECONDS < density_deadline )) || { echo 'Task density proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_DENSITY_EVIDENCE/density-proof.json" <<'JS'
const assert = require('node:assert/strict');
const proof = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
assert(proof.ok && proof.realDitz && proof.packagedCore && proof.defaultView.visibleTitles.length >= 3);
assert.equal(proof.rendererErrors.length, 0);
assert.equal(proof.modelTurns, 0);
console.log(`Actual CLI-authored task density: ${proof.defaultView.visibleTitles.length} titles initially visible; search/filter/disclosure/small-window keyboard passed.`);
JS
