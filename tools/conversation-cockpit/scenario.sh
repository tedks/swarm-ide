#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "$SWARM_ARTIFACT_DIR/window-selected"
deadline=$((SECONDS + 90))
await_evidence() {
  while [[ ! -s "$SWARM_ARTIFACT_DIR/$1" ]]; do
    [[ ! -s "$SWARM_ARTIFACT_DIR/failure.json" ]] || { sed -n '1,30p' "$SWARM_ARTIFACT_DIR/failure.json"; return 1; }
    (( SECONDS < deadline )) || { echo "Conversation proof timed out waiting for $1"; return 1; }
    sleep 0.1
  done
}
await_evidence proof.json
swarm_window_capture "$SWARM_ARTIFACT_DIR/conversation-cockpit.png"
touch "$SWARM_ARTIFACT_DIR/close-request"
await_evidence postclose.json
node -e 'const p=require(process.argv[1]);if(p.desktopCode!==0)process.exit(1)' "$SWARM_ARTIFACT_DIR/postclose.json"
