#!/usr/bin/env bash
# This target exercises a Vite-served Electron development window; its title
# synchronization channel is intentionally absent from packaged builds.
set -euo pipefail

workspace="${BUILD_WORKSPACE_DIRECTORY:-}"
if [[ -z "$workspace" ]]; then
  script_path=$(readlink -f "$0")
  workspace=$(cd "$(dirname "$script_path")/.." && pwd)
fi
artifact_dir="${SWARM_ARTIFACT_DIR:-$workspace/artifacts/desktop}"
renderer_argument=$(node "$workspace/tools/dev-port.mjs" renderer-process-argument)
if [[ -z "$renderer_argument" ]]; then
  echo "development port resolver returned an empty window marker" >&2
  exit 2
fi
renderer_url=${renderer_argument#*=}

if [[ -z "${DISPLAY:-}" ]]; then
  echo "desktop smoke requires an X11 DISPLAY; no display is configured" >&2
  exit 2
fi
if [[ "${XDG_SESSION_TYPE:-x11}" == "wayland" && "${SWARM_ALLOW_XWAYLAND:-0}" != "1" ]]; then
  echo "desktop smoke detected Wayland; set SWARM_ALLOW_XWAYLAND=1 to test through XWayland, or replace the X11 driver" >&2
  exit 2
fi

mkdir -p "$artifact_dir"

window_id=""
for _ in $(seq 1 50); do
  for candidate in $(xdotool search --name '^swarm-ide —' 2>/dev/null || true); do
    candidate_pid=$(xdotool getwindowpid "$candidate" 2>/dev/null || true)
    if [[ -n "$candidate_pid" ]] &&
       tr '\0' '\n' <"/proc/$candidate_pid/cmdline" 2>/dev/null |
         grep -Fq -- "$renderer_argument"; then
      window_id="$candidate"
      break
    fi
  done
  [[ -n "$window_id" ]] && break
  sleep 0.1
done
if [[ -z "$window_id" ]]; then
  echo "no swarm-ide desktop window found for $renderer_url; first run with the same SWARM_DEV_PORT: nix develop --command bazel run //:dev" >&2
  exit 3
fi

wait_for_title() {
  local needle="$1"
  local presence="${2:-present}"
  local title=""
  for _ in $(seq 1 55); do
    title=$(xdotool getwindowname "$window_id")
    if [[ "$presence" == "present" && "$title" == *"$needle"* ]] ||
       [[ "$presence" == "absent" && "$title" != *"$needle"* ]]; then
      return 0
    fi
    sleep 0.04
  done
  echo "window title did not make '$needle' $presence: $title" >&2
  return 1
}

activate_window() {
  local active=""
  wmctrl -i -a "$window_id"
  for _ in $(seq 1 25); do
    active=$(xdotool getactivewindow 2>/dev/null || true)
    [[ "$active" == "$window_id" ]] && return 0
    sleep 0.02
  done
  echo "could not activate the selected swarm-ide window; active window is '$active'" >&2
  return 1
}

activate_window
# User-local zoom may survive an earlier development run. Normalize it before
# coordinate-based assertions so this general smoke test retains its baseline.
before_zoom_revision=""
for _ in $(seq 1 100); do
  initial_zoom_title=$(xdotool getwindowname "$window_id")
  before_zoom_revision=$(sed -n 's/.*Zoom [0-9][0-9]*%@\([0-9][0-9]*\).*/\1/p' <<<"$initial_zoom_title")
  [[ -n "$before_zoom_revision" ]] && break
  sleep 0.04
done
if [[ -z "$before_zoom_revision" ]]; then
  echo "initial zoom never reached a confirmed state: ${initial_zoom_title:-unknown}" >&2
  exit 4
fi
xdotool key --clearmodifiers ctrl+0
for _ in $(seq 1 100); do
  zoom_title=$(xdotool getwindowname "$window_id")
  after_zoom_revision=$(sed -n 's/.*Zoom 100%@\([0-9][0-9]*\).*/\1/p' <<<"$zoom_title")
  if [[ -n "$before_zoom_revision" && -n "$after_zoom_revision" ]] && (( after_zoom_revision > before_zoom_revision )); then break; fi
  sleep 0.04
done
if [[ -z "${after_zoom_revision:-}" ]] || (( after_zoom_revision <= before_zoom_revision )); then
  echo "Ctrl+0 did not receive a confirmed zoom acknowledgment: ${zoom_title:-unknown}" >&2
  exit 4
fi
geometry=$(xdotool getwindowgeometry --shell "$window_id")
WIDTH=$(sed -n 's/^WIDTH=//p' <<<"$geometry")
HEIGHT=$(sed -n 's/^HEIGHT=//p' <<<"$geometry")
if [[ ! "$WIDTH" =~ ^[0-9]+$ || ! "$HEIGHT" =~ ^[0-9]+$ ]]; then
  echo "could not parse Electron window geometry" >&2
  exit 4
fi

capture_window() {
  local destination="$1"
  activate_window
  sleep 0.05
  import -window "$window_id" "$destination"
}

run_command() {
  local command="$1"
  xdotool key --clearmodifiers Escape
  wait_for_title "Palette open" absent
  xdotool key --clearmodifiers ctrl+k
  wait_for_title "Palette open"
  # The palette begins at 11vh; 26px is the midpoint of its fixed 52px header.
  local palette_input_y=$((HEIGHT * 11 / 100 + 26))
  xdotool mousemove --window "$window_id" "$((WIDTH / 2))" "$palette_input_y" click 1
  xdotool key --clearmodifiers ctrl+a
  xdotool type --clearmodifiers --delay 2 "$command"
  last_command_submitted_ms=$(date +%s%3N)
  xdotool key --clearmodifiers Return
  wait_for_title "Palette open" absent
}

current_title=$(xdotool getwindowname "$window_id")
if [[ "$current_title" != *" — Graphs — "* ]]; then
  run_command "Show system graphs"
  wait_for_title "Graphs"
fi
capture_window "$artifact_dir/before.png"

run_command "Build repository service topology"
build_started_ms=$last_command_submitted_ms
wait_for_title "Reconciling"
yellow_ms=$(( $(date +%s%3N) - build_started_ms ))
yellow_title=$(xdotool getwindowname "$window_id")
if [[ "$yellow_title" != *"Graphs"* ]]; then
  echo "yellow state left the graph surface unexpectedly: $yellow_title" >&2
  exit 4
fi
wait_for_title "Consistent"
wait_for_title "FraudCheck visible"
green_ms=$(( $(date +%s%3N) - build_started_ms ))
green_title=$(xdotool getwindowname "$window_id")
if [[ "$green_title" != *"Consistent"* ]]; then
  echo "topology did not reach a consistent real publication: $green_title" >&2
  exit 4
fi
capture_window "$artifact_dir/reconciled.png"

run_command "Open FraudCheck implementation"
wait_for_title "Source fraudcheck.ts"
capture_window "$artifact_dir/fraudcheck-source.png"

run_command "Open FraudCheck protobuf contract"
wait_for_title "Source fraudcheck.proto"
capture_window "$artifact_dir/fraudcheck-contract.png"

run_command "Show system graphs"
wait_for_title "Graphs"
wait_for_title "FraudCheck visible"
capture_window "$artifact_dir/returned-to-graphs.png"

changed_pixels=$(magick "$artifact_dir/reconciled.png" "$artifact_dir/fraudcheck-source.png" \
  -compose difference -composite -threshold 0 -format '%[fx:round(mean*w*h)]' info:)
if ! awk -v changed="$changed_pixels" 'BEGIN { exit !(changed + 0 >= 1000) }'; then
  echo "desktop source assertion failed: only '$changed_pixels' pixels changed" >&2
  exit 5
fi

echo "desktop smoke passed"
echo "window_id=$window_id"
echo "renderer_url=$renderer_url"
echo "window_title=$(xdotool getwindowname "$window_id")"
echo "click_to_yellow_ms=$yellow_ms"
echo "click_to_green_ms=$green_ms"
echo "changed_pixels=$changed_pixels"
echo "artifacts=$artifact_dir"
identify "$artifact_dir/before.png" "$artifact_dir/reconciled.png" "$artifact_dir/fraudcheck-source.png" "$artifact_dir/fraudcheck-contract.png" "$artifact_dir/returned-to-graphs.png"
