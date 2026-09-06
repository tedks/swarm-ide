#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
swarm_window_wait_title "Core 1:ready" present 20000
# Enter source through the same keyboard palette as the developer, not direct
# focus mutation. No topology build or fabricated green service graph is needed.
swarm_window_key ctrl+k
swarm_window_wait_title "Palette open"
swarm_window_type "Open repository path" 1
swarm_window_key Return
swarm_window_wait_title "Palette open"
swarm_window_key ctrl+a
swarm_window_type "examples/checkout-world/services/fraudcheck/fraudcheck.ts" 1
swarm_window_key Return
swarm_window_wait_title "Palette open" absent
swarm_window_wait_title "Source fraudcheck.ts"
node "${SWARM_SOURCE_WORKSPACE:?}/tools/agent-journey-client.mjs"
swarm_window_assert_selected
swarm_window_capture "${SWARM_ARTIFACT_DIR:?}/final-owned-window.png"
printf 'Agent journey completed through the owned window %s\n' "$SWARM_WINDOW_ID"
