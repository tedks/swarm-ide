#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
workspace=${SWARM_SOURCE_WORKSPACE:?}
artifacts=${SWARM_ARTIFACT_DIR:?}
[[ "$workspace" == */swarm-reload-scenario.*/repo && -d "$workspace/.git" ]] || { echo "reload edits require an owned disposable source copy" >&2; exit 2; }
swarm_window_wait_title 'Core 1:ready'
swarm_window_key ctrl+0
swarm_window_wait_title 'Zoom 100%'
original_window=$SWARM_WINDOW_ID
original_pid=$SWARM_WINDOW_PID
doc() { swarm_window_title | sed -n 's/.* — Doc \([0-9]*\).*/\1/p'; }
core() { swarm_window_title | sed -n 's/.* — Core \([0-9]*\):ready.*/\1/p'; }
original_doc=$(doc)
geometry=$(swarm_window_geometry)
width=$(sed -n 's/^WIDTH=//p' <<<"$geometry")
height=$(sed -n 's/^HEIGHT=//p' <<<"$geometry")
command_palette() {
  swarm_window_activate
  swarm_window_key Escape
  swarm_window_key ctrl+k
  swarm_window_wait_title 'Palette open'
  swarm_window_click "$((width / 2))" "$((height * 11 / 100 + 26))"
  swarm_window_key ctrl+a
  swarm_window_type "$1" 1
  swarm_window_key Return
  if (( $# == 2 )); then
    swarm_window_wait_title 'Palette open'
    swarm_window_key ctrl+a
    swarm_window_type "$2" 1
    swarm_window_key Return
  fi
  swarm_window_wait_title 'Palette open' absent
}
background() {
  swarm_x11_exec wmctrl -n 2
  swarm_x11_exec xdotool set_desktop_for_window "$original_window" 0
  swarm_x11_exec xdotool set_desktop 1
  if [[ -z "${other_window:-}" ]]; then
    swarm_x11_exec xmessage -name swarm-reload-focus-owner -buttons OK:0 'Focus stays here during Swarm IDE updates' &
    other_pid=$!
    for _ in $(seq 1 50); do
      other_window=$(swarm_x11_exec xdotool search --name swarm-reload-focus-owner 2>/dev/null | head -1 || true)
      [[ -n "$other_window" ]] && break
      sleep 0.05
    done
  fi
  swarm_x11_exec xdotool windowactivate --sync "$other_window"
}
assert_stable() {
  swarm_window_assert_selected
  [[ "$SWARM_WINDOW_ID" == "$original_window" && "$SWARM_WINDOW_PID" == "$original_pid" ]]
  [[ $(swarm_x11_exec xdotool get_desktop_for_window "$original_window") == 0 ]]
  [[ $(swarm_x11_exec xdotool get_desktop) == 1 ]]
  [[ $(swarm_x11_exec xdotool getactivewindow) == "$other_window" ]]
  echo "$1: window=$original_window main_pid=$original_pid workspace=0 active_workspace=1 focus=$other_window doc=$(doc) core=$(core)"
}
wait_core_change() {
  local old=$1
  for _ in $(seq 1 200); do
    next_core=$(core)
    [[ -n "$next_core" && "$next_core" != "$old" ]] && return
    sleep 0.05
  done
  echo 'core did not recover' >&2; return 1
}
wait_doc_change() {
  local old=$1
  for _ in $(seq 1 100); do
    next_doc=$(doc)
    [[ -n "$next_doc" && "$next_doc" != "$old" ]] && return
    sleep 0.05
  done
  echo 'document did not refresh' >&2; return 1
}
edit() {
  # Exact replacement in disposable sources, atomic to avoid editor-save noise.
  node - "$workspace/$1" "$2" "$3" <<'NODE'
const fs = require('node:fs');
const [path, before, after] = process.argv.slice(2);
const text = fs.readFileSync(path, 'utf8');
if (!text.includes(before)) throw new Error('missing exact edit needle: ' + before);
fs.writeFileSync(path + '.scenario-tmp', text.replace(before, after));
fs.renameSync(path + '.scenario-tmp', path);
NODE
}

# Source/reload correctness is independent of declared service availability.
command_palette 'Open repository path' 'README.md'
swarm_window_wait_title 'README.md:saved'
swarm_window_capture "$artifacts/source-before.png"
background
start=$(date +%s%3N)
edit app/renderer/App.tsx 'central navigation' 'live renderer update verified'
swarm_window_wait_title 'HMR '
[[ $(doc) == "$original_doc" && $(core) == 1 ]]
assert_stable renderer
echo "renderer_edit_to_update_ms=$(( $(date +%s%3N) - start ))"

# Comments compile but do not change the executable and must not reload.
edit core/worker.ts 'let sequence = 0;' '/* comment-only edit */ let sequence = 0;'
sleep 1
[[ $(doc) == "$original_doc" && $(core) == 1 ]]
assert_stable comment_only

start=$(date +%s%3N)
edit core/worker.ts 'let sequence = 0;' 'console.log("RELOAD_CORE_V2_EXECUTED"); let sequence = 0;'
wait_core_change 1
grep -q RELOAD_CORE_V2_EXECUTED "$artifacts/app.log"
[[ $(doc) == "$original_doc" ]]
swarm_window_wait_title 'README.md:saved'
assert_stable core
echo "core_edit_to_recovery_ms=$(( $(date +%s%3N) - start ))"

# An invalid core build leaves the running generation and document untouched.
old_core=$(core)
edit core/worker.ts 'let sequence = 0;' 'let sequence = ;'
swarm_window_wait_title 'Build failed'
[[ $(doc) == "$original_doc" && $(core) == "$old_core" ]]
assert_stable failed_build
edit core/worker.ts 'let sequence = ;' 'let sequence = 0;'
swarm_window_wait_title 'Build failed' absent
[[ $(core) == "$old_core" ]]

# A real core crash is scoped by exact parent/session identity before signalling.
core_pid=$(sed -n 's/.*spawned pid=\([0-9]*\) generation=.*/\1/p' "$artifacts/app.log" | tail -1)
[[ $(ps -o ppid= -p "$core_pid" | tr -d ' ') == "$original_pid" ]]
[[ $(_swarm_x11_session_id "$core_pid") == "$SWARM_APP_SESSION" ]]
start=$(date +%s%3N)
kill -KILL "$core_pid"
wait_core_change "$old_core"
[[ $(doc) == "$original_doc" ]]
assert_stable crash_recovery
echo "crash_to_recovery_ms=$(( $(date +%s%3N) - start ))"

# A dirty buffer survives a preload rebuild and explicit keyboard reload.
swarm_window_activate
swarm_window_click "$((width * 60 / 100))" "$((height * 45 / 100))"
swarm_window_key ctrl+End
swarm_window_type '// UNSAVED_RELOAD_SENTINEL' 1
swarm_window_wait_title 'README.md:dirty'
# Changing the hook signature remounts App without unloading the document.
edit app/renderer/App.tsx 'export function App() {' 'export function App() { useState("structural-refresh-probe");'
sleep 1
swarm_window_wait_title 'README.md:dirty'
[[ $(doc) == "$original_doc" ]]
swarm_window_key ctrl+r
sleep 0.3
[[ $(doc) == "$original_doc" ]]
background
edit app/electron/preload.ts 'const REQUEST_CHANNEL = "swarm:request";' 'const REQUEST_CHANNEL = "swarm:" + String("request");'
swarm_window_wait_title 'Reload pending'
[[ $(doc) == "$original_doc" ]]
assert_stable dirty_preload_deferred

swarm_window_activate
swarm_window_click "$((width * 60 / 100))" "$((height * 45 / 100))"
swarm_window_key ctrl+s
start=$(date +%s%3N)
# Move focus away before the safe document refresh is acknowledged.
background
wait_doc_change "$original_doc"
swarm_window_wait_title 'README.md:saved'
grep -q UNSAVED_RELOAD_SENTINEL "$workspace/README.md"
assert_stable safe_preload_refresh
echo "save_to_preload_refresh_ms=$(( $(date +%s%3N) - start ))"
original_doc=$(doc)

# Several quick edits converge on the final executable without a native restart.
old_core=$(core)
for i in 3 4 5; do
  edit core/worker.ts "RELOAD_CORE_V$((i - 1))_EXECUTED" "RELOAD_CORE_V${i}_EXECUTED"
done
wait_core_change "$old_core"
for _ in $(seq 1 100); do grep -q RELOAD_CORE_V5_EXECUTED "$artifacts/app.log" && break; sleep 0.05; done
grep -q RELOAD_CORE_V5_EXECUTED "$artifacts/app.log"
[[ $(doc) == "$original_doc" ]]
assert_stable rapid_core_edits

# Coalesce core+preload invalidation; both new boundaries execute, and
# source/navigation survive the required document refresh.
old_core=$(core)
edit core/worker.ts 'RELOAD_CORE_V5_EXECUTED' 'RELOAD_CORE_V6_EXECUTED'
edit app/electron/preload.ts 'String("request")' 'String("request").trim()'
wait_core_change "$old_core"
wait_doc_change "$original_doc"
original_doc=$(doc)
swarm_window_wait_title 'README.md:saved'
assert_stable combined_update

edit app/electron/main.ts 'width: 1480' 'width: 1481'
swarm_window_wait_title 'Restart required'
[[ $(doc) == "$original_doc" ]]
assert_stable main_deferred
swarm_window_capture "$artifacts/reload-final.png"
echo 'Selective reload smoke passed: live renderer, unchanged build, core, crash, failed build, dirty preload, safe refresh, rapid edits, manual main restart.'
