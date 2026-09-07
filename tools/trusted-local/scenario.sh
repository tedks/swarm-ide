#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_TRUSTED_EVIDENCE:?}/window-selected"
trusted_deadline=$((SECONDS + 100))
while [[ ! -s "$SWARM_TRUSTED_EVIDENCE/proof.json" ]]; do
  [[ ! -s "$SWARM_TRUSTED_EVIDENCE/failure.json" ]] || { cat "$SWARM_TRUSTED_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < trusted_deadline )) || { echo 'Trusted-local packaged proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_TRUSTED_EVIDENCE/proof.json" <<'JS'
const p = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (!p.ok || !p.packagedCore || p.modelTurns !== 0 || p.rendererErrors.length || p.providerStarts !== 1 || !p.sourceRetained || !p.camerasRetained || !p.sessionClosed) process.exit(1);
console.log('Packaged trusted-local context, launch, approval, next turn and Stop passed; no model turn.');
JS
swarm_window_capture "$SWARM_TRUSTED_EVIDENCE/window.png"
