#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_SERVICE_EVIDENCE:?}/window-selected"
service_deadline=$((SECONDS + 60))
while [[ ! -s "$SWARM_SERVICE_EVIDENCE/proof.json" ]]; do
  if [[ -s "$SWARM_SERVICE_EVIDENCE/failure.json" ]]; then cat "$SWARM_SERVICE_EVIDENCE/failure.json"; exit 1; fi
  (( SECONDS < service_deadline )) || { echo 'Declared-service desktop proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_SERVICE_EVIDENCE/proof.json" <<'JS'
const p = JSON.parse(require('node:fs').readFileSync(process.argv[2]));
if (!p.ok || !p.packagedCore || p.rendererErrors.length || !Object.values(p.retained).every(Boolean)) process.exit(1);
console.log(`Packaged declared services passed in ${p.elapsedMs}ms, with source and cameras retained`);
JS
