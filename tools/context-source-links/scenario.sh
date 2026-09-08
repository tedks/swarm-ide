#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_LINK_EVIDENCE:?}/window-selected"
link_deadline=$((SECONDS + 110))
while [[ ! -s "$SWARM_LINK_EVIDENCE/proof.json" ]]; do
  [[ ! -s "$SWARM_LINK_EVIDENCE/failure.json" ]] || { cat "$SWARM_LINK_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < link_deadline )) || { echo 'Packaged source-links proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_LINK_EVIDENCE/proof.json" <<'JS'
const proof = JSON.parse(require('node:fs').readFileSync(process.argv[2]));
if (!proof.ok || !proof.realBazel || !proof.packagedCore || !proof.dirtySourceRetained || !proof.graphInstancesRetained || proof.rendererErrors.length) process.exit(1);
console.log(`Actual packaged Context target and Alt-click navigation passed: ${proof.elapsedMs}ms`);
JS
swarm_window_capture "$SWARM_LINK_EVIDENCE/source-links-window.png"
