#!/usr/bin/env bash
set -euo pipefail

workspace="${BUILD_WORKSPACE_DIRECTORY:-}"
if [[ -z "$workspace" ]]; then
  script_path=$(readlink -f "$0")
  workspace=$(cd "$(dirname "$script_path")/.." && pwd)
fi
artifact_dir="${SWARM_ARTIFACT_DIR:-$workspace/artifacts/desktop}"

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
  window_id=$(xdotool search --name '^swarm-ide —' 2>/dev/null | head -n1 || true)
  [[ -n "$window_id" ]] && break
  sleep 0.1
done
if [[ -z "$window_id" ]]; then
  echo "no swarm-ide desktop window found; first run: nix develop --command bazel run //:dev" >&2
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

# Reset through the keyboard command surface so every run begins at work:a1.
xdotool key --clearmodifiers Escape
wait_for_title "Palette open" absent
xdotool key --clearmodifiers ctrl+k
wait_for_title "Palette open"
xdotool mousemove --window "$window_id" "$((WIDTH / 2))" "$((HEIGHT * 14 / 100))" click 1
xdotool key --clearmodifiers ctrl+a
xdotool type --clearmodifiers --delay 3 'Reset fixture world'
xdotool key --clearmodifiers Return
wait_for_title "Palette open" absent
sleep 0.2
reset_title=$(xdotool getwindowname "$window_id")
if [[ "$reset_title" != *"work:a1"* || "$reset_title" == *"FraudCheck visible"* ]]; then
  echo "fixture reset did not restore the exact work:a1 world: $reset_title" >&2
  exit 4
fi
capture_window "$artifact_dir/before.png"

# Open with a hotkey, then dispatch by clicking the top command.
xdotool key --clearmodifiers ctrl+k
wait_for_title "Palette open"
palette_command_y=$((HEIGHT * 11 / 100 + 80))
activate_window
xdotool mousemove --window "$window_id" "$((WIDTH / 2))" "$palette_command_y" click 1

wait_for_title "Palette open" absent
wait_for_title "Reconciling"
yellow_title=$(xdotool getwindowname "$window_id")
if [[ "$yellow_title" != *"work:b2"* || "$yellow_title" == *"FraudCheck visible"* ]]; then
  echo "yellow state did not retain the expected work:a1 topology over work:b2: $yellow_title" >&2
  exit 4
fi
wait_for_title "FraudCheck visible"
green_title=$(xdotool getwindowname "$window_id")
if [[ "$green_title" != *"work:b2"* ]]; then
  echo "green publication does not identify work:b2: $green_title" >&2
  exit 4
fi
sleep 0.25
capture_window "$artifact_dir/reconciled.png"

changed_pixels=$(magick "$artifact_dir/before.png" "$artifact_dir/reconciled.png" \
  -compose difference -composite -threshold 0 -format '%[fx:round(mean*w*h)]' info:)
if [[ ! "$changed_pixels" =~ ^[0-9]+$ ]] || (( changed_pixels < 1000 )); then
  echo "desktop state assertion failed: only '$changed_pixels' pixels changed" >&2
  exit 5
fi

echo "desktop smoke passed"
echo "window_id=$window_id"
echo "window_title=$(xdotool getwindowname "$window_id")"
echo "changed_pixels=$changed_pixels"
echo "artifacts=$artifact_dir"
identify "$artifact_dir/before.png" "$artifact_dir/reconciled.png"
