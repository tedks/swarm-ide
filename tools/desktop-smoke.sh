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
  local attempts="$2"
  local title=""
  for _ in $(seq 1 "$attempts"); do
    title=$(xdotool getwindowname "$window_id")
    [[ "$title" == *"$needle"* ]] && return 0
    sleep 0.04
  done
  echo "window never reached '$needle'; final title: $title" >&2
  return 1
}

wmctrl -i -a "$window_id"
xdotool windowfocus --sync "$window_id"

# Reset through the keyboard command surface so every run begins at work:a1.
xdotool key --clearmodifiers Escape
xdotool key --clearmodifiers ctrl+k
sleep 0.1
xdotool key --clearmodifiers ctrl+a
xdotool type --clearmodifiers --delay 3 'Reset fixture world'
xdotool key --clearmodifiers Return
sleep 0.08
xdotool key --clearmodifiers Escape
wait_for_title "Consistent" 25
import -window "$window_id" "$artifact_dir/before.png"

# Open with a hotkey, then dispatch by clicking the top command.
xdotool key --clearmodifiers ctrl+k
sleep 0.14
import -window "$window_id" "$artifact_dir/command-palette.png"
eval "$(xdotool getwindowgeometry --shell "$window_id")"
palette_command_y=$((HEIGHT * 11 / 100 + 80))
xdotool mousemove --window "$window_id" "$((WIDTH / 2))" "$palette_command_y" click 1

wait_for_title "Reconciling" 25
sleep 0.1
import -window "$window_id" "$artifact_dir/reconciling.png"
wait_for_title "FraudCheck visible" 55
import -window "$window_id" "$artifact_dir/reconciled.png"

difference=$(compare -metric AE "$artifact_dir/before.png" "$artifact_dir/reconciled.png" null: 2>&1 || true)
changed_pixels=${difference%% *}
if [[ ! "$changed_pixels" =~ ^[0-9]+([.][0-9]+)?$ ]] || ! awk -v value="$changed_pixels" 'BEGIN { exit !(value >= 1000) }'; then
  echo "desktop state assertion failed: only '$difference' pixels changed" >&2
  exit 4
fi

echo "desktop smoke passed"
echo "window_id=$window_id"
echo "window_title=$(xdotool getwindowname "$window_id")"
echo "changed_pixels=$changed_pixels"
echo "artifacts=$artifact_dir"
identify "$artifact_dir/before.png" "$artifact_dir/command-palette.png" "$artifact_dir/reconciling.png" "$artifact_dir/reconciled.png"
