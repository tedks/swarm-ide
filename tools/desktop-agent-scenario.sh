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
swarm_window_type "Open repository path" 10
swarm_window_key Return
# The generic title was already true before Enter: wait for the actual mode
# transition before typing, and use human-paced native text under cold builds.
swarm_window_wait_title "Palette open · exact path"
swarm_window_key ctrl+a
swarm_window_type "README.md" 10
swarm_window_key Return
swarm_window_wait_title "Palette open" absent
swarm_window_wait_title "Source README.md"
node "${SWARM_SOURCE_WORKSPACE:?}/tools/agent-journey-client.mjs"
swarm_window_assert_selected
swarm_window_capture "${SWARM_ARTIFACT_DIR:?}/final-owned-window.png"
printf 'Agent journey completed through the owned window %s\n' "$SWARM_WINDOW_ID"
