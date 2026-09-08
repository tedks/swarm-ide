#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_PLAN_UI_EVIDENCE:?}/window-selected"
plan_deadline=$((SECONDS + 65))
while [[ ! -s "$SWARM_PLAN_UI_EVIDENCE/proof.json" ]]; do
  [[ ! -s "$SWARM_PLAN_UI_EVIDENCE/failure.json" ]] || { cat "$SWARM_PLAN_UI_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < plan_deadline )) || { echo 'Component plan packaged proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_PLAN_UI_EVIDENCE/proof.json" <<'JS'
const p = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (!p.ok || p.modelTurns !== 0 || p.rendererErrors.length || p.providerStarts !== 1 || !p.sourceRetained || !p.sessionClosed) process.exit(1);
console.log('Packaged Generate → visible agent → validated repository design passed (controlled provider).');
JS
swarm_window_capture "$SWARM_PLAN_UI_EVIDENCE/window.png"
