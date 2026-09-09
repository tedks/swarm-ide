#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_HEALTH_EVIDENCE:?}/window-selected"
health_deadline=$((SECONDS + 80))
while [[ ! -s "$SWARM_HEALTH_EVIDENCE/proof.json" ]]; do
  if [[ -s "$SWARM_HEALTH_EVIDENCE/failure.json" ]]; then cat "$SWARM_HEALTH_EVIDENCE/failure.json"; exit 1; fi
  (( SECONDS < health_deadline )) || { echo 'Renderer health proof timed out'; exit 1; }
  sleep 0.1
done
cat "$SWARM_HEALTH_EVIDENCE/proof.json"
