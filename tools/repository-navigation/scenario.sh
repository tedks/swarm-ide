#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_NAVIGATION_EVIDENCE:?}/window-selected"
navigation_deadline=$((SECONDS + 150))
while [[ ! -s "$SWARM_NAVIGATION_EVIDENCE/navigation-proof.json" ]]; do
  [[ ! -s "$SWARM_NAVIGATION_EVIDENCE/navigation-failure.json" ]] || { cat "$SWARM_NAVIGATION_EVIDENCE/navigation-failure.json"; exit 1; }
  (( SECONDS < navigation_deadline )) || { echo 'Packaged navigation proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_NAVIGATION_EVIDENCE/navigation-proof.json" <<'JS'
const fs = require('node:fs');
const proof = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!proof.ok || !proof.realFilesystem || !proof.packagedCore || proof.modelTurns !== 0 || proof.rendererErrors.length !== 0) process.exit(1);
console.log(`Actual packaged navigation passed: ${proof.case}, ${proof.elapsedMs}ms, no model turn.`);
JS
swarm_window_capture "$SWARM_NAVIGATION_EVIDENCE/navigation-window.png"
