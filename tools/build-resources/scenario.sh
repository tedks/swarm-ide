#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_RESOURCES_EVIDENCE:?}/window-selected"
resources_deadline=$((SECONDS + 70))
while [[ ! -s "$SWARM_RESOURCES_EVIDENCE/proof.json" ]]; do
  [[ ! -s "$SWARM_RESOURCES_EVIDENCE/failure.json" ]] || { cat "$SWARM_RESOURCES_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < resources_deadline )) || { echo 'Build resources journey timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_RESOURCES_EVIDENCE/proof.json" <<'JS'
const proof = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (!proof.ok || !proof.packagedCore || !proof.retained || !proof.keyboard ||
    proof.productMutations.length || proof.resourceRequests.length || proof.rendererErrors.length) process.exit(1);
console.log('Packaged resource example: keyboard controls, real unsaved source and graph retention; no resource requests or mutations.');
JS
swarm_window_capture "$SWARM_RESOURCES_EVIDENCE/window.png"
