#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
scripts=$(dirname "$(readlink -f "$0")")
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_LIVE_EVIDENCE:?}/window-selected"
deadline=$((SECONDS + 90))
while [[ ! -s "$SWARM_LIVE_EVIDENCE/proof.json" ]]; do
  [[ ! -s "$SWARM_LIVE_EVIDENCE/failure.json" ]] || { cat "$SWARM_LIVE_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < deadline )) || { echo 'Live observer proof timed out'; exit 1; }
  sleep 0.1
done
swarm_window_capture "$SWARM_LIVE_EVIDENCE/window.png"
touch "$SWARM_LIVE_EVIDENCE/close-request"
while [[ ! -s "$SWARM_LIVE_EVIDENCE/postclose.json" ]]; do
  [[ ! -s "$SWARM_LIVE_EVIDENCE/failure.json" ]] || { cat "$SWARM_LIVE_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < deadline )) || { echo 'Live observer close proof timed out'; exit 1; }
  sleep 0.1
done
node "$scripts/verify.cjs" "$SWARM_LIVE_EVIDENCE"
