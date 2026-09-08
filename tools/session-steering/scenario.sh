#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_STEERING_EVIDENCE:?}/window-selected"
deadline=$((SECONDS + 90))
await_evidence() {
  while [[ ! -s "$SWARM_STEERING_EVIDENCE/$1" ]]; do
    [[ ! -s "$SWARM_STEERING_EVIDENCE/failure.json" ]] || { cat "$SWARM_STEERING_EVIDENCE/failure.json"; return 1; }
    (( SECONDS < deadline )) || { echo "Session steering proof timed out waiting for $1"; return 1; }
    sleep 0.1
  done
}
await_evidence proof.json
swarm_window_capture "$SWARM_STEERING_EVIDENCE/window.png"
touch "$SWARM_STEERING_EVIDENCE/close-request"
await_evidence postclose.json
scripts=$(dirname "$(readlink -f "$0")")
node "$scripts/verify.cjs" "$SWARM_STEERING_EVIDENCE"
