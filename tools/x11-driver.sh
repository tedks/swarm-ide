#!/usr/bin/env bash

# Shared, fail-closed X11 automation for Swarm IDE desktop scenarios. This
# file is sourced by scenarios; it deliberately changes no shell options.

swarm_x11_error() {
  printf 'swarm x11 driver: %s\n' "$*" >&2
  return 1
}

_swarm_x11_read_one_line() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] || return 1
  IFS= read -r REPLY <"$path" || [[ -n "${REPLY:-}" ]]
}

_swarm_x11_start_ticks() {
  local pid="$1"
  local proc_root="${SWARM_PROC_ROOT:-/proc}"
  local stat_line rest
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
  IFS= read -r stat_line <"$proc_root/$pid/stat" || return 1
  # The comm field is parenthesized and may contain spaces. Remove through the
  # last ") "; starttime is then field 20 of the remaining field-3 suffix.
  rest=${stat_line##*) }
  awk '{print $20}' <<<"$rest"
}

_swarm_x11_session_id() {
  local pid="$1"
  local ps_bin="${SWARM_PS_BIN:-ps}"
  local result
  result=$("$ps_bin" -o sid= -p "$pid" 2>/dev/null) || return 1
  result=${result//[[:space:]]/}
  [[ "$result" =~ ^[1-9][0-9]*$ ]] || return 1
  printf '%s\n' "$result"
}

_swarm_x11_command() {
  local override_name="$1"
  local default_name="$2"
  local value="${!override_name:-}"
  if [[ -n "$value" ]]; then
    [[ "$value" == /* && -x "$value" ]] || {
      swarm_x11_error "$override_name must name an executable absolute path"
      return 1
    }
    printf '%s\n' "$value"
    return 0
  fi
  command -v "$default_name" || {
    swarm_x11_error "required command '$default_name' is unavailable"
    return 1
  }
}

swarm_x11_assert_owned() {
  local owner_dir="${SWARM_X11_OWNERSHIP_DIR:-}"
  local display="${SWARM_X11_DISPLAY:-}"
  local authority="${SWARM_X11_XAUTHORITY:-}"
  local token="${SWARM_X11_TOKEN:-}"
  local recorded_display recorded_authority recorded_token xvfb_pid xvfb_start actual_start
  local mode proc_root="${SWARM_PROC_ROOT:-/proc}" cmdline

  [[ -n "$owner_dir" && "$owner_dir" == /* && -d "$owner_dir" && ! -L "$owner_dir" ]] ||
    swarm_x11_error "missing private ownership directory" || return 1
  mode=$(stat -c '%a' "$owner_dir" 2>/dev/null) ||
    swarm_x11_error "cannot inspect ownership directory" || return 1
  [[ "$mode" == "700" ]] || swarm_x11_error "ownership directory mode is $mode, expected 700" || return 1
  [[ "$display" =~ ^:[1-9][0-9]*$ ]] ||
    swarm_x11_error "owned display must be a nonzero local X11 display, got '${display:-unset}'" || return 1
  [[ -n "$authority" && "$authority" == /* && -f "$authority" && ! -L "$authority" ]] ||
    swarm_x11_error "owned Xauthority is missing or unsafe" || return 1
  [[ -n "$token" ]] || swarm_x11_error "ownership token is missing" || return 1

  _swarm_x11_read_one_line "$owner_dir/display" && recorded_display="$REPLY" ||
    swarm_x11_error "ownership display record is missing" || return 1
  _swarm_x11_read_one_line "$owner_dir/xauthority" && recorded_authority="$REPLY" ||
    swarm_x11_error "ownership Xauthority record is missing" || return 1
  _swarm_x11_read_one_line "$owner_dir/token" && recorded_token="$REPLY" ||
    swarm_x11_error "ownership token record is missing" || return 1
  _swarm_x11_read_one_line "$owner_dir/xvfb.pid" && xvfb_pid="$REPLY" ||
    swarm_x11_error "ownership X-server PID record is missing" || return 1
  _swarm_x11_read_one_line "$owner_dir/xvfb.start" && xvfb_start="$REPLY" ||
    swarm_x11_error "ownership X-server start-time record is missing" || return 1

  [[ "$recorded_display" == "$display" ]] || swarm_x11_error "display does not match ownership record" || return 1
  [[ "$recorded_authority" == "$authority" ]] || swarm_x11_error "Xauthority does not match ownership record" || return 1
  [[ "$recorded_token" == "$token" ]] || swarm_x11_error "token does not match ownership record" || return 1
  [[ "${DISPLAY:-}" == "$display" ]] ||
    swarm_x11_error "ambient DISPLAY '${DISPLAY:-unset}' is not the owned display '$display'" || return 1
  [[ "${XAUTHORITY:-}" == "$authority" ]] ||
    swarm_x11_error "ambient XAUTHORITY does not match the owned authority" || return 1

  actual_start=$(_swarm_x11_start_ticks "$xvfb_pid") ||
    swarm_x11_error "owned X-server process is not live" || return 1
  [[ "$actual_start" == "$xvfb_start" ]] || swarm_x11_error "owned X-server PID was reused" || return 1
  cmdline=$(tr '\0' '\n' <"$proc_root/$xvfb_pid/cmdline" 2>/dev/null) ||
    swarm_x11_error "cannot inspect owned X-server command line" || return 1
  grep -Fq -- "$display" <<<"$cmdline" || swarm_x11_error "X-server command line lacks owned display" || return 1
  grep -Fq -- "$authority" <<<"$cmdline" || swarm_x11_error "X-server command line lacks owned Xauthority" || return 1
}

swarm_x11_exec() {
  swarm_x11_assert_owned || return 1
  env DISPLAY="$SWARM_X11_DISPLAY" XAUTHORITY="$SWARM_X11_XAUTHORITY" "$@"
}

_swarm_window_pid_matches() {
  local candidate_pid="$1"
  local marker="$2"
  local expected_session="$3"
  local proc_root="${SWARM_PROC_ROOT:-/proc}"
  local cmdline session
  [[ "$candidate_pid" =~ ^[1-9][0-9]*$ ]] || return 1
  cmdline=$(tr '\0' '\n' <"$proc_root/$candidate_pid/cmdline" 2>/dev/null) || return 1
  grep -Fq -- "$marker" <<<"$cmdline" || return 1
  session=$(_swarm_x11_session_id "$candidate_pid") || return 1
  [[ "$session" == "$expected_session" ]]
}

swarm_window_select() {
  local marker="$1"
  local app_session="$2"
  local title_pattern="${3:-^swarm-ide —}"
  local timeout_ms="${4:-10000}"
  local xdotool_bin start_ms now_ms candidate candidate_pid candidate_title
  local -a candidates=() matches=()

  [[ -n "$marker" ]] || swarm_x11_error "window marker is empty" || return 1
  [[ "$app_session" =~ ^[1-9][0-9]*$ ]] || swarm_x11_error "app session is invalid" || return 1
  [[ "$timeout_ms" =~ ^[1-9][0-9]*$ ]] || swarm_x11_error "window timeout is invalid" || return 1
  xdotool_bin=$(_swarm_x11_command SWARM_XDOTOOL_BIN xdotool) || return 1
  start_ms=$(date +%s%3N)

  while true; do
    candidates=()
    mapfile -t candidates < <(swarm_x11_exec "$xdotool_bin" search --name "$title_pattern" 2>/dev/null || true)
    matches=()
    for candidate in "${candidates[@]}"; do
      [[ "$candidate" =~ ^[1-9][0-9]*$ ]] || continue
      candidate_title=$(swarm_x11_exec "$xdotool_bin" getwindowname "$candidate" 2>/dev/null || true)
      [[ "$candidate_title" =~ $title_pattern ]] || continue
      candidate_pid=$(swarm_x11_exec "$xdotool_bin" getwindowpid "$candidate" 2>/dev/null || true)
      if _swarm_window_pid_matches "$candidate_pid" "$marker" "$app_session"; then
        matches+=("$candidate:$candidate_pid")
      fi
    done
    if (( ${#matches[@]} == 1 )); then
      SWARM_WINDOW_ID=${matches[0]%%:*}
      SWARM_WINDOW_PID=${matches[0]#*:}
      SWARM_WINDOW_MARKER="$marker"
      SWARM_APP_SESSION="$app_session"
      export SWARM_WINDOW_ID SWARM_WINDOW_PID SWARM_WINDOW_MARKER SWARM_APP_SESSION
      return 0
    fi
    if (( ${#matches[@]} > 1 )); then
      swarm_x11_error "multiple marked windows belong to app session $app_session"
      return 1
    fi
    now_ms=$(date +%s%3N)
    (( now_ms - start_ms < timeout_ms )) || break
    sleep 0.05
  done
  swarm_x11_error "no marked window appeared for the owned app session within ${timeout_ms}ms"
}

swarm_window_assert_selected() {
  local xdotool_bin current_pid
  [[ "${SWARM_WINDOW_ID:-}" =~ ^[1-9][0-9]*$ && "${SWARM_WINDOW_PID:-}" =~ ^[1-9][0-9]*$ ]] ||
    swarm_x11_error "no window has been selected" || return 1
  xdotool_bin=$(_swarm_x11_command SWARM_XDOTOOL_BIN xdotool) || return 1
  current_pid=$(swarm_x11_exec "$xdotool_bin" getwindowpid "$SWARM_WINDOW_ID" 2>/dev/null) ||
    swarm_x11_error "selected window is no longer available" || return 1
  [[ "$current_pid" == "$SWARM_WINDOW_PID" ]] || swarm_x11_error "selected X11 window ID was recycled" || return 1
  _swarm_window_pid_matches "$current_pid" "$SWARM_WINDOW_MARKER" "$SWARM_APP_SESSION" ||
    swarm_x11_error "selected window no longer belongs to the marked app session" || return 1
}

swarm_window_title() {
  local xdotool_bin
  swarm_window_assert_selected || return 1
  xdotool_bin=$(_swarm_x11_command SWARM_XDOTOOL_BIN xdotool) || return 1
  swarm_x11_exec "$xdotool_bin" getwindowname "$SWARM_WINDOW_ID"
}

swarm_window_wait_title() {
  local needle="$1"
  local presence="${2:-present}"
  local timeout_ms="${3:-10000}"
  local start_ms now_ms title=""
  [[ "$presence" == "present" || "$presence" == "absent" ]] ||
    swarm_x11_error "title presence must be 'present' or 'absent'" || return 1
  [[ "$timeout_ms" =~ ^[1-9][0-9]*$ ]] || swarm_x11_error "title timeout is invalid" || return 1
  start_ms=$(date +%s%3N)
  while true; do
    title=$(swarm_window_title) || return 1
    if [[ "$presence" == "present" && "$title" == *"$needle"* ]] ||
       [[ "$presence" == "absent" && "$title" != *"$needle"* ]]; then
      return 0
    fi
    now_ms=$(date +%s%3N)
    (( now_ms - start_ms < timeout_ms )) || break
    sleep 0.04
  done
  swarm_x11_error "window title did not make '$needle' $presence within ${timeout_ms}ms: $title"
}

swarm_window_activate() {
  local wmctrl_bin xdotool_bin start_ms now_ms active=""
  swarm_window_assert_selected || return 1
  wmctrl_bin=$(_swarm_x11_command SWARM_WMCTRL_BIN wmctrl) || return 1
  xdotool_bin=$(_swarm_x11_command SWARM_XDOTOOL_BIN xdotool) || return 1
  swarm_x11_exec "$wmctrl_bin" -i -a "$SWARM_WINDOW_ID" ||
    swarm_x11_error "window manager refused activation" || return 1
  start_ms=$(date +%s%3N)
  while true; do
    active=$(swarm_x11_exec "$xdotool_bin" getactivewindow 2>/dev/null || true)
    [[ "$active" == "$SWARM_WINDOW_ID" ]] && return 0
    now_ms=$(date +%s%3N)
    (( now_ms - start_ms < 2000 )) || break
    sleep 0.04
  done
  swarm_x11_error "selected window did not become active; active window is '${active:-unknown}'"
}

swarm_window_geometry() {
  local xdotool_bin
  swarm_window_assert_selected || return 1
  xdotool_bin=$(_swarm_x11_command SWARM_XDOTOOL_BIN xdotool) || return 1
  swarm_x11_exec "$xdotool_bin" getwindowgeometry --shell "$SWARM_WINDOW_ID"
}

swarm_window_key() {
  local chord="$1"
  local xdotool_bin
  swarm_window_assert_selected || return 1
  xdotool_bin=$(_swarm_x11_command SWARM_XDOTOOL_BIN xdotool) || return 1
  swarm_x11_exec "$xdotool_bin" key --window "$SWARM_WINDOW_ID" --clearmodifiers "$chord" ||
    swarm_x11_error "key input failed for '$chord'" || return 1
}

swarm_window_type() {
  local value="$1"
  local delay="${2:-2}"
  local xdotool_bin
  swarm_window_assert_selected || return 1
  xdotool_bin=$(_swarm_x11_command SWARM_XDOTOOL_BIN xdotool) || return 1
  swarm_x11_exec "$xdotool_bin" type --window "$SWARM_WINDOW_ID" --clearmodifiers --delay "$delay" -- "$value" ||
    swarm_x11_error "text input failed" || return 1
}

swarm_window_click() {
  local x="$1"
  local y="$2"
  local xdotool_bin
  [[ "$x" =~ ^[0-9]+$ && "$y" =~ ^[0-9]+$ ]] || swarm_x11_error "click coordinates are invalid" || return 1
  swarm_window_assert_selected || return 1
  xdotool_bin=$(_swarm_x11_command SWARM_XDOTOOL_BIN xdotool) || return 1
  swarm_x11_exec "$xdotool_bin" mousemove --window "$SWARM_WINDOW_ID" "$x" "$y" click 1 ||
    swarm_x11_error "pointer input failed at $x,$y" || return 1
}

swarm_window_capture() {
  local destination="$1"
  local crop="${2:-}"
  local import_bin
  [[ -n "$destination" && "$destination" == /* ]] ||
    swarm_x11_error "screenshot destination must be absolute" || return 1
  swarm_window_assert_selected || return 1
  import_bin=$(_swarm_x11_command SWARM_IMPORT_BIN import) || return 1
  mkdir -p "$(dirname "$destination")"
  swarm_window_activate || return 1
  if [[ -n "$crop" ]]; then
    [[ "$crop" =~ ^[1-9][0-9]*x[1-9][0-9]*\+[0-9]+\+[0-9]+$ ]] ||
      swarm_x11_error "invalid screenshot crop '$crop'" || return 1
    swarm_x11_exec "$import_bin" -window "$SWARM_WINDOW_ID" -crop "$crop" +repage "$destination" ||
      swarm_x11_error "screenshot capture failed for '$destination'" || return 1
  else
    swarm_x11_exec "$import_bin" -window "$SWARM_WINDOW_ID" "$destination" ||
      swarm_x11_error "screenshot capture failed for '$destination'" || return 1
  fi
  [[ -s "$destination" ]] || swarm_x11_error "screenshot capture produced no data" || return 1
}
