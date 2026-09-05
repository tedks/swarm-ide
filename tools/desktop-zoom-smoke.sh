#!/usr/bin/env bash
set -euo pipefail

workspace="${BUILD_WORKSPACE_DIRECTORY:-}"
if [[ -z "$workspace" ]]; then
  script_path=$(readlink -f "$0")
  workspace=$(cd "$(dirname "$script_path")/.." && pwd)
fi
artifact_dir="${SWARM_ARTIFACT_DIR:-$workspace/artifacts/desktop-zoom}"
renderer_argument=$(node "$workspace/tools/dev-port.mjs" renderer-process-argument)
renderer_url=${renderer_argument#*=}

if [[ -z "${DISPLAY:-}" ]]; then
  echo "desktop zoom smoke requires an X11 DISPLAY" >&2
  exit 2
fi
if [[ "${XDG_SESSION_TYPE:-x11}" == "wayland" && "${SWARM_ALLOW_XWAYLAND:-0}" != "1" ]]; then
  echo "desktop zoom smoke requires X11 or explicit XWayland opt-in" >&2
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
  echo "no swarm-ide desktop window found for $renderer_url" >&2
  exit 3
fi

wait_for_title() {
  local needle="$1"
  local presence="${2:-present}"
  local title=""
  for _ in $(seq 1 75); do
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
  echo "could not activate the zoom-test window; active window is '$active'" >&2
  return 1
}

capture_window() {
  local destination="$1"
  activate_window
  sleep 0.08
  import -window "$window_id" "$destination"
}

activate_window
xdotool key --clearmodifiers Escape
xdotool key --clearmodifiers ctrl+0
wait_for_title "Zoom 100%"
capture_window "$artifact_dir/zoom-100.png"

# An editable command field keeps its focus and content while Ctrl+= performs
# the conventional browser-level accessibility action.
xdotool key --clearmodifiers ctrl+k
wait_for_title "Palette open"
xdotool type --clearmodifiers --delay 4 'focus remains'
capture_window "$artifact_dir/zoom-100-focused.png"
xdotool key --clearmodifiers ctrl+equal
wait_for_title "Zoom 125%"
wait_for_title "Palette open"
xdotool type --clearmodifiers --delay 4 ' editable'
capture_window "$artifact_dir/zoom-125-focused.png"

# Reload must reconstruct the zoom from renderer-local persistence. The palette
# disappearing proves that a document reload occurred rather than a stale title
# satisfying the zoom assertion.
xdotool key --clearmodifiers ctrl+r
wait_for_title "Palette open" absent
wait_for_title "Zoom 125%"
capture_window "$artifact_dir/zoom-125-reloaded.png"

xdotool key --clearmodifiers ctrl+0
wait_for_title "Zoom 100%"
capture_window "$artifact_dir/zoom-reset.png"

changed_pixels_raw=$(magick "$artifact_dir/zoom-100-focused.png" "$artifact_dir/zoom-125-focused.png" \
  -compose difference -composite -threshold 0 -format '%[fx:mean*w*h]' info:)
changed_pixels=$(awk -v value="$changed_pixels_raw" 'BEGIN { printf "%.0f", value }')
if [[ ! "$changed_pixels" =~ ^[0-9]+$ ]] || (( changed_pixels < 1000 )); then
  echo "zoom assertion failed: only '$changed_pixels' pixels changed" >&2
  exit 4
fi

echo "desktop zoom smoke passed"
echo "window_id=$window_id"
echo "renderer_url=$renderer_url"
echo "window_title=$(xdotool getwindowname "$window_id")"
echo "changed_pixels=$changed_pixels"
echo "artifacts=$artifact_dir"
identify "$artifact_dir/zoom-100.png" "$artifact_dir/zoom-100-focused.png" \
  "$artifact_dir/zoom-125-focused.png" \
  "$artifact_dir/zoom-125-reloaded.png" "$artifact_dir/zoom-reset.png"
