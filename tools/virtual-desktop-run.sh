#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: virtual-desktop-run.sh <scenario> <dev-launcher> <scenario-name>" >&2
  exit 2
}

[[ $# == 3 ]] || usage
scenario=$1
dev_launcher=$2
scenario_name=$3
[[ "$scenario" == /* && -x "$scenario" ]] || { echo "virtual desktop: scenario must be an executable absolute path" >&2; exit 2; }
[[ "$dev_launcher" == /* && -x "$dev_launcher" ]] || { echo "virtual desktop: dev launcher must be an executable absolute path" >&2; exit 2; }
[[ "$scenario_name" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "virtual desktop: invalid scenario name" >&2; exit 2; }

script_path=$(readlink -f "$0")
script_dir=$(dirname "$script_path")
workspace="${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-}}"
if [[ -z "$workspace" ]]; then
  workspace=$(cd "$script_dir/.." && pwd)
fi
workspace=$(readlink -f "$workspace")
[[ -f "$workspace/package.json" && -f "$workspace/tools/dev-port.mjs" ]] || {
  echo "virtual desktop: cannot resolve the Swarm IDE source workspace" >&2
  exit 2
}

resolve_command() {
  local override_name="$1"
  local default_name="$2"
  local value="${!override_name:-}"
  if [[ -n "$value" ]]; then
    [[ "$value" == /* && -x "$value" ]] || {
      echo "virtual desktop: $override_name must name an executable absolute path" >&2
      return 1
    }
    printf '%s\n' "$value"
  else
    command -v "$default_name" || {
      echo "virtual desktop: required command '$default_name' is unavailable" >&2
      return 1
    }
  fi
}

xvfb_bin=$(resolve_command SWARM_XVFB_BIN Xvfb)
xauth_bin=$(resolve_command SWARM_XAUTH_BIN xauth)
wm_bin=$(resolve_command SWARM_WM_BIN openbox)
xdpyinfo_bin=$(resolve_command SWARM_XDPYINFO_BIN xdpyinfo)
wmctrl_bin=$(resolve_command SWARM_WMCTRL_BIN wmctrl)
xdotool_bin=$(resolve_command SWARM_XDOTOOL_BIN xdotool)
import_bin=$(resolve_command SWARM_IMPORT_BIN import)
node_bin=$(resolve_command SWARM_NODE_BIN node)
ps_bin=$(resolve_command SWARM_PS_BIN ps)
setsid_bin=$(resolve_command SWARM_SETSID_BIN setsid)
timeout_bin=$(resolve_command SWARM_TIMEOUT_BIN timeout)

artifact_dir="${SWARM_ARTIFACT_DIR:-}"
if [[ -z "$artifact_dir" && -n "${TEST_UNDECLARED_OUTPUTS_DIR:-}" ]]; then
  artifact_dir="$TEST_UNDECLARED_OUTPUTS_DIR/$scenario_name"
elif [[ -z "$artifact_dir" ]]; then
  artifact_dir="$workspace/artifacts/$scenario_name/$(date -u +%Y%m%dT%H%M%SZ)-$$"
fi
[[ "$artifact_dir" == /* ]] || {
  echo "virtual desktop: artifact directory must be absolute" >&2
  exit 2
}
mkdir -p "$artifact_dir"
artifact_dir=$(readlink -f "$artifact_dir")
supervisor_log="$artifact_dir/supervisor.log"
touch "$supervisor_log"

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)" "$*" | tee -a "$supervisor_log"
}

fail() {
  log "ERROR: $*" >&2
  return 1
}

now_ms() {
  date +%s%3N
}

proc_start_ticks() {
  local pid="$1"
  local stat_line rest
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
  IFS= read -r stat_line <"/proc/$pid/stat" || return 1
  rest=${stat_line##*) }
  awk '{print $20}' <<<"$rest"
}

pid_session() {
  local pid="$1" result
  result=$("$ps_bin" -o sid= -p "$pid" 2>/dev/null) || return 1
  result=${result//[[:space:]]/}
  [[ "$result" =~ ^[1-9][0-9]*$ ]] || return 1
  printf '%s\n' "$result"
}

token=$(tr -d '-' </proc/sys/kernel/random/uuid)
[[ "$token" =~ ^[0-9a-f]{32}$ ]] || { fail "could not create an ownership token"; exit 2; }
runtime_root="${SWARM_X11_RUNTIME_ROOT:-${XDG_RUNTIME_DIR:-/tmp}}"
[[ "$runtime_root" == /* && -d "$runtime_root" && ! -L "$runtime_root" ]] || {
  fail "runtime root must be an existing absolute directory"
  exit 2
}
runtime_dir=$(mktemp -d "$runtime_root/swarm-ide-x11.XXXXXX")
chmod 700 "$runtime_dir"
ownership_dir="$runtime_dir/ownership"
mkdir "$ownership_dir"
chmod 700 "$ownership_dir"
authority="$runtime_dir/Xauthority"
touch "$authority"
chmod 600 "$authority"

xvfb_pid="" xvfb_start="" xvfb_session=""
wm_pid="" wm_start="" wm_session=""
app_pid="" app_start="" app_session=""
scenario_pid="" scenario_start="" scenario_session=""
display_lock="" display=""
cleanup_started=0
cleanup_failed=0
restore_path="" restore_backup="" restore_expected=""

session_members() {
  local wanted_session="$1"
  "$ps_bin" -e -o pid=,sid= | awk -v wanted="$wanted_session" '$2 == wanted { print $1 }'
}

process_belongs_to_session() {
  local pid="$1" start_floor="$2" start
  start=$(proc_start_ticks "$pid" 2>/dev/null) || return 2
  [[ "$start" =~ ^[0-9]+$ && "$start" -ge "$start_floor" ]] || return 1
}

signal_owned_session() {
  local wanted_session="$1" start_floor="$2" signal="$3"
  local pid found=0 unsafe=0 leader_start="" membership_status=0
  [[ "$wanted_session" =~ ^[1-9][0-9]*$ && "$start_floor" =~ ^[0-9]+$ ]] || return 0
  if [[ -e "/proc/$wanted_session/stat" ]]; then
    leader_start=$(proc_start_ticks "$wanted_session" 2>/dev/null || true)
    if [[ "$leader_start" != "$start_floor" ]]; then
      log "REFUSED: session leader PID $wanted_session was reused"
      return 1
    fi
  fi
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    found=1
    # A process cannot join an existing POSIX session from outside it. If the
    # leader is still alive its saved start time proves identity; if it has
    # exited, the kernel retains the session identity while members remain.
    set +e
    process_belongs_to_session "$pid" "$start_floor"
    membership_status=$?
    set -e
    if (( membership_status == 0 )); then
      kill "-$signal" "$pid" 2>/dev/null || true
    elif (( membership_status == 2 )) && [[ ! -e "/proc/$pid/stat" ]]; then
      # The process exited between ps(1)'s session snapshot and /proc
      # validation. It is already clean, not an ownership violation.
      continue
    else
      log "REFUSED: PID $pid in session $wanted_session predates the owned session"
      unsafe=1
    fi
  done < <(session_members "$wanted_session" 2>/dev/null || true)
  (( unsafe == 0 )) || return 1
  (( found == 1 ))
}

stop_owned_session() {
  local label="$1" wanted_session="$2" start_floor="$3"
  local attempt
  [[ -n "$wanted_session" && -n "$start_floor" ]] || return 0
  for attempt in $(seq 1 20); do
    if ! signal_owned_session "$wanted_session" "$start_floor" TERM; then
      # No members is success; an unsafe member was already reported. Check
      # explicitly so an empty session does not turn cleanup red.
      [[ -z "$(session_members "$wanted_session" 2>/dev/null || true)" ]] && return 0
      cleanup_failed=1
      return 1
    fi
    sleep 0.05
  done
  signal_owned_session "$wanted_session" "$start_floor" KILL || true
  for attempt in $(seq 1 20); do
    [[ -z "$(session_members "$wanted_session" 2>/dev/null || true)" ]] && return 0
    sleep 0.05
  done
  log "ERROR: $label session $wanted_session survived bounded teardown"
  cleanup_failed=1
  return 1
}

write_ownership_artifact() {
  {
    printf 'scenario=%s\n' "$scenario_name"
    printf 'display=%s\n' "${display:-unallocated}"
    printf 'port=%s\n' "${port:-unallocated}"
    printf 'runtime_dir=%s\n' "$runtime_dir"
    printf 'xvfb_pid=%s\n' "${xvfb_pid:-unstarted}"
    printf 'xvfb_start=%s\n' "${xvfb_start:-unstarted}"
    printf 'wm_pid=%s\n' "${wm_pid:-unstarted}"
    printf 'wm_start=%s\n' "${wm_start:-unstarted}"
    printf 'app_pid=%s\n' "${app_pid:-unstarted}"
    printf 'app_session=%s\n' "${app_session:-unstarted}"
    printf 'app_start=%s\n' "${app_start:-unstarted}"
    printf 'window_id=%s\n' "${SWARM_WINDOW_ID:-unselected}"
    printf 'window_pid=%s\n' "${SWARM_WINDOW_PID:-unselected}"
  } >"$artifact_dir/ownership.txt"
}

cleanup() {
  local original_status=$?
  (( cleanup_started == 0 )) || return "$original_status"
  cleanup_started=1
  set +e
  write_ownership_artifact
  stop_owned_session scenario "$scenario_session" "$scenario_start"
  stop_owned_session app "$app_session" "$app_start"
  stop_owned_session window-manager "$wm_session" "$wm_start"
  stop_owned_session X-server "$xvfb_session" "$xvfb_start"
  if [[ -n "$restore_path" ]]; then
    if [[ -f "$restore_backup" && ! -L "$restore_path" ]] && cmp -s -- "$restore_backup" "$restore_path"; then
      :
    elif [[ -f "$restore_backup" && -f "$restore_expected" && ! -L "$restore_path" ]] &&
         cmp -s -- "$restore_expected" "$restore_path"; then
      cp --preserve=mode,timestamps -- "$restore_backup" "$restore_path" || cleanup_failed=1
    else
      cp -- "$restore_backup" "$artifact_dir/restore-backup" 2>/dev/null || true
      log "ERROR: source file changed outside the scenario's expected edit; refusing to overwrite '$restore_path'"
      cleanup_failed=1
    fi
  fi
  if [[ -n "$display_lock" && -d "$display_lock" && ! -L "$display_lock" ]]; then
    lock_token=""
    if [[ -f "$display_lock/token" && ! -L "$display_lock/token" ]]; then
      IFS= read -r lock_token <"$display_lock/token" || true
    fi
    if [[ "$lock_token" == "$token" ]]; then
      rm -f -- "$display_lock/token"
      rmdir -- "$display_lock" 2>/dev/null || {
        log "ERROR: owned display lock is not empty: $display_lock"
        cleanup_failed=1
      }
    else
      log "REFUSED: display lock token changed; leaving $display_lock"
      cleanup_failed=1
    fi
  fi
  rm -f -- "$authority"
  if [[ -d "$runtime_dir" && ! -L "$runtime_dir" && "$runtime_dir" == "$runtime_root"/swarm-ide-x11.* ]]; then
    find "$runtime_dir" -depth -mindepth 1 -delete 2>/dev/null || cleanup_failed=1
    rmdir -- "$runtime_dir" 2>/dev/null || cleanup_failed=1
  else
    log "REFUSED: unsafe runtime cleanup path '$runtime_dir'"
    cleanup_failed=1
  fi
  log "cleanup_complete=$(( cleanup_failed == 0 ? 1 : 0 )) artifacts=$artifact_dir"
  set -e
  if (( cleanup_failed != 0 && original_status == 0 )); then return 1; fi
  return "$original_status"
}

on_signal() {
  local signal_name="$1" exit_code="$2"
  log "received $signal_name; beginning owned teardown"
  exit "$exit_code"
}

trap cleanup EXIT
trap 'on_signal INT 130' INT
trap 'on_signal TERM 143' TERM
trap 'on_signal HUP 129' HUP

if [[ -n "${SWARM_SCENARIO_RESTORE_PATH:-}" ]]; then
  [[ ! -L "$SWARM_SCENARIO_RESTORE_PATH" ]] || {
    fail "scenario restore path cannot be a symlink"
    exit 2
  }
  restore_path=$(readlink -f "$SWARM_SCENARIO_RESTORE_PATH" 2>/dev/null || true)
  [[ -n "$restore_path" && "$restore_path" == "$workspace"/* && -f "$restore_path" && ! -L "$restore_path" ]] || {
    fail "scenario restore path must be a regular file inside the source workspace"
    exit 2
  }
  restore_backup="$runtime_dir/restore-backup"
  restore_expected="$runtime_dir/restore-expected"
  cp --preserve=mode,timestamps -- "$restore_path" "$restore_backup"
fi

for timeout_name in SWARM_X_START_TIMEOUT_MS SWARM_WM_START_TIMEOUT_MS SWARM_APP_START_TIMEOUT_MS SWARM_WINDOW_START_TIMEOUT_MS; do
  timeout_value="${!timeout_name:-}"
  [[ -z "$timeout_value" || "$timeout_value" =~ ^[1-9][0-9]*$ ]] || {
    fail "$timeout_name must be a positive integer"
    exit 2
  }
done

lock_root="${SWARM_X11_LOCK_ROOT:-/tmp}"
socket_root="${SWARM_X11_SOCKET_ROOT:-/tmp/.X11-unix}"
[[ "$lock_root" == /* && -d "$lock_root" && ! -L "$lock_root" ]] || { fail "display lock root is unsafe"; exit 2; }
[[ "$socket_root" == /* ]] || { fail "X11 socket root must be absolute"; exit 2; }

acquire_display() {
  local number="$1"
  local candidate_lock="$lock_root/.swarm-ide-x11-$number.lock"
  [[ ! -e "$socket_root/X$number" && ! -e "/tmp/.X${number}-lock" ]] || return 1
  mkdir "$candidate_lock" 2>/dev/null || return 1
  chmod 700 "$candidate_lock"
  printf '%s\n' "$token" >"$candidate_lock/token"
  display_lock="$candidate_lock"
  display=":$number"
}

if [[ -n "${SWARM_VIRTUAL_DISPLAY:-}" ]]; then
  [[ "$SWARM_VIRTUAL_DISPLAY" =~ ^:([1-9][0-9]*)$ ]] || { fail "SWARM_VIRTUAL_DISPLAY must be a nonzero local display such as :99"; exit 2; }
  requested_number=${BASH_REMATCH[1]}
  acquire_display "$requested_number" || { fail "requested display :$requested_number is occupied or stale"; exit 3; }
else
  for number in $(seq 90 189); do
    acquire_display "$number" && break
  done
  [[ -n "$display" ]] || { fail "no owned display was available in :90 through :189"; exit 3; }
fi

port="${SWARM_VIRTUAL_DESKTOP_PORT:-55174}"
[[ "$port" =~ ^[0-9]+$ && "$port" -ge 1 && "$port" -le 65535 ]] || { fail "invalid virtual desktop port '$port'"; exit 2; }
if ! "$node_bin" -e '
  const net = require("node:net");
  const server = net.createServer();
  server.unref();
  server.once("error", () => process.exit(1));
  server.listen(Number(process.argv[1]), "127.0.0.1", () => server.close(() => process.exit(0)));
' "$port"; then
  fail "loopback port $port is already occupied"
  exit 3
fi

cookie=$(tr -d '-' </proc/sys/kernel/random/uuid)
env DISPLAY="$display" XAUTHORITY="$authority" \
  "$xauth_bin" -f "$authority" add "$display" . "$cookie" >>"$artifact_dir/xauth.log" 2>&1 || {
  fail "could not create Xauthority for $display"
  exit 4
}

printf '%s\n' "$display" >"$ownership_dir/display"
printf '%s\n' "$authority" >"$ownership_dir/xauthority"
printf '%s\n' "$token" >"$ownership_dir/token"

start_ms=$(now_ms)
env DISPLAY="$display" XAUTHORITY="$authority" SWARM_X11_TOKEN="$token" \
  "$setsid_bin" "$xvfb_bin" "$display" -screen 0 1440x900x24 -nolisten tcp -noreset -auth "$authority" \
  >"$artifact_dir/xvfb.log" 2>&1 &
xvfb_pid=$!
xvfb_start=$(proc_start_ticks "$xvfb_pid") || { fail "X server exited before its identity could be recorded"; exit 4; }
xvfb_session=$(pid_session "$xvfb_pid") || { fail "cannot determine X-server process session"; exit 4; }
[[ "$xvfb_session" == "$xvfb_pid" ]] || { fail "X server did not start as an isolated process session"; exit 4; }
printf '%s\n' "$xvfb_pid" >"$ownership_dir/xvfb.pid"
printf '%s\n' "$xvfb_start" >"$ownership_dir/xvfb.start"

deadline=$(( $(now_ms) + ${SWARM_X_START_TIMEOUT_MS:-5000} ))
while ! env DISPLAY="$display" XAUTHORITY="$authority" "$xdpyinfo_bin" -display "$display" >/dev/null 2>&1; do
  kill -0 "$xvfb_pid" 2>/dev/null || { fail "X server exited before readiness"; exit 4; }
  (( $(now_ms) < deadline )) || { fail "X server readiness timed out"; exit 4; }
  sleep 0.05
done
x_ready_ms=$(( $(now_ms) - start_ms ))

cat >"$runtime_dir/openbox-rc.xml" <<'OPENBOX'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <focus><focusNew>yes</focusNew><followMouse>no</followMouse></focus>
  <placement><policy>Smart</policy><center>yes</center></placement>
  <desktops><number>1</number></desktops>
</openbox_config>
OPENBOX
env DISPLAY="$display" XAUTHORITY="$authority" SWARM_X11_TOKEN="$token" \
  "$setsid_bin" "$wm_bin" --config-file "$runtime_dir/openbox-rc.xml" \
  >"$artifact_dir/wm.log" 2>&1 &
wm_pid=$!
wm_start=$(proc_start_ticks "$wm_pid") || { fail "window manager exited before its identity could be recorded"; exit 4; }
wm_session=$(pid_session "$wm_pid") || { fail "cannot determine window-manager process session"; exit 4; }
[[ "$wm_session" == "$wm_pid" ]] || { fail "window manager did not start as an isolated process session"; exit 4; }

deadline=$(( $(now_ms) + ${SWARM_WM_START_TIMEOUT_MS:-5000} ))
while ! env DISPLAY="$display" XAUTHORITY="$authority" "$wmctrl_bin" -m >/dev/null 2>&1; do
  kill -0 "$wm_pid" 2>/dev/null || { fail "window manager exited before readiness"; exit 4; }
  (( $(now_ms) < deadline )) || { fail "window-manager readiness timed out"; exit 4; }
  sleep 0.05
done
wm_ready_ms=$(( $(now_ms) - start_ms ))

renderer_marker=$(SWARM_DEV_PORT="$port" "$node_bin" "$workspace/tools/dev-port.mjs" renderer-process-argument) || {
  fail "development marker resolution failed"
  exit 4
}
[[ -n "$renderer_marker" ]] || { fail "development marker resolution returned empty output"; exit 4; }

env DISPLAY="$display" XAUTHORITY="$authority" SWARM_X11_TOKEN="$token" \
  SWARM_X11_DISPLAY="$display" SWARM_X11_XAUTHORITY="$authority" \
  SWARM_X11_OWNERSHIP_DIR="$ownership_dir" SWARM_RENDERER_PROCESS_ARGUMENT="$renderer_marker" \
  SWARM_DEV_PORT="$port" BUILD_WORKSPACE_DIRECTORY="$workspace" LIBGL_ALWAYS_SOFTWARE=1 \
  XDG_CONFIG_HOME="$runtime_dir/config" XDG_CACHE_HOME="$runtime_dir/cache" \
  "$setsid_bin" "$dev_launcher" >"$artifact_dir/app.log" 2>&1 &
app_pid=$!
app_start=$(proc_start_ticks "$app_pid") || { fail "app exited before its identity could be recorded"; exit 5; }
app_session=$(pid_session "$app_pid") || { fail "cannot determine app process session"; exit 5; }
[[ "$app_session" == "$app_pid" ]] || { fail "app did not start as an isolated process session"; exit 5; }
printf '%s\n' "$app_pid" >"$ownership_dir/app.pid"
printf '%s\n' "$app_start" >"$ownership_dir/app.start"
printf '%s\n' "$app_session" >"$ownership_dir/app.session"

deadline=$(( $(now_ms) + ${SWARM_APP_START_TIMEOUT_MS:-30000} ))
while ! (exec 9<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; do
  kill -0 "$app_pid" 2>/dev/null || { fail "app exited before port $port became ready"; exit 5; }
  (( $(now_ms) < deadline )) || { fail "app port readiness timed out"; exit 5; }
  sleep 0.1
done
port_ready_ms=$(( $(now_ms) - start_ms ))

export DISPLAY="$display"
export XAUTHORITY="$authority"
export SWARM_X11_DISPLAY="$display"
export SWARM_X11_XAUTHORITY="$authority"
export SWARM_X11_OWNERSHIP_DIR="$ownership_dir"
export SWARM_X11_TOKEN="$token"
export SWARM_PROC_ROOT=/proc
export SWARM_XDOTOOL_BIN="$xdotool_bin"
export SWARM_WMCTRL_BIN="$wmctrl_bin"
export SWARM_IMPORT_BIN="$import_bin"
export SWARM_PS_BIN="$ps_bin"
export SWARM_APP_SESSION="$app_session"
export SWARM_RENDERER_PROCESS_ARGUMENT="$renderer_marker"
export SWARM_ARTIFACT_DIR="$artifact_dir"
export SWARM_X11_DRIVER_PATH="$script_dir/x11-driver.sh"

# shellcheck source=tools/x11-driver.sh
source "$script_dir/x11-driver.sh"
swarm_window_select "$renderer_marker" "$app_session" '^swarm-ide —' "${SWARM_WINDOW_START_TIMEOUT_MS:-15000}" || {
  fail "exact marked app window did not become ready"
  exit 5
}
window_ready_ms=$(( $(now_ms) - start_ms ))

resource_snapshot() {
  local phase="$1"
  local stamp pid sid rss command pss
  stamp=$(now_ms)
  while read -r pid sid rss command; do
    [[ "$sid" == "$xvfb_session" || "$sid" == "$wm_session" || "$sid" == "$app_session" ]] || continue
    pss=$(awk '/^Pss:/ {print $2; exit}' "/proc/$pid/smaps_rollup" 2>/dev/null || true)
    [[ "$pss" =~ ^[0-9]+$ ]] || pss=0
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$stamp" "$phase" "$pid" "$sid" "$rss" "$pss" "$command"
  done < <("$ps_bin" -e -o pid=,sid=,rss=,comm=) >>"$artifact_dir/resources.tsv"
}
printf 'timestamp_ms\tphase\tpid\tsid\trss_kib\tpss_kib\tcommand\n' >"$artifact_dir/resources.tsv"
resource_snapshot ready
write_ownership_artifact

scenario_timeout_seconds="${SWARM_SCENARIO_TIMEOUT_SECONDS:-120}"
[[ "$scenario_timeout_seconds" =~ ^[1-9][0-9]*$ ]] || { fail "scenario timeout must be positive seconds"; exit 2; }
scenario_started_ms=$(now_ms)
env DISPLAY="$display" XAUTHORITY="$authority" SWARM_X11_TOKEN="$token" \
  SWARM_X11_DISPLAY="$display" SWARM_X11_XAUTHORITY="$authority" \
  SWARM_X11_OWNERSHIP_DIR="$ownership_dir" SWARM_XDOTOOL_BIN="$xdotool_bin" \
  SWARM_WMCTRL_BIN="$wmctrl_bin" SWARM_IMPORT_BIN="$import_bin" SWARM_PS_BIN="$ps_bin" \
  SWARM_APP_SESSION="$app_session" SWARM_RENDERER_PROCESS_ARGUMENT="$renderer_marker" \
  SWARM_WINDOW_ID="$SWARM_WINDOW_ID" SWARM_WINDOW_PID="$SWARM_WINDOW_PID" SWARM_WINDOW_MARKER="$renderer_marker" \
  SWARM_ARTIFACT_DIR="$artifact_dir" SWARM_X11_DRIVER_PATH="$script_dir/x11-driver.sh" \
  SWARM_SOURCE_WORKSPACE="$workspace" BUILD_WORKSPACE_DIRECTORY="$workspace" \
  SWARM_SCENARIO_RESTORE_PATH="$restore_path" SWARM_SCENARIO_RESTORE_EXPECTED="$restore_expected" \
  "$setsid_bin" "$timeout_bin" --signal=TERM --kill-after=5 "$scenario_timeout_seconds" "$scenario" \
  >"$artifact_dir/scenario.log" 2>&1 &
scenario_pid=$!
scenario_start=$(proc_start_ticks "$scenario_pid") || { fail "scenario exited before its identity could be recorded"; exit 6; }
scenario_session=$(pid_session "$scenario_pid") || { fail "cannot determine scenario process session"; exit 6; }
[[ "$scenario_session" == "$scenario_pid" ]] || { fail "scenario did not start as an isolated process session"; exit 6; }
set +e
wait "$scenario_pid"
scenario_status=$?
set -e
scenario_elapsed_ms=$(( $(now_ms) - scenario_started_ms ))
resource_snapshot complete
cat "$artifact_dir/scenario.log"
if (( scenario_status != 0 )); then
  if (( scenario_status == 124 || scenario_status == 137 )); then
    fail "scenario timed out after ${scenario_timeout_seconds}s"
  else
    fail "scenario exited with status $scenario_status"
  fi
  exit "$scenario_status"
fi

total_elapsed_ms=$(( $(now_ms) - start_ms ))
{
  printf 'x_ready_ms=%s\n' "$x_ready_ms"
  printf 'wm_ready_ms=%s\n' "$wm_ready_ms"
  printf 'port_ready_ms=%s\n' "$port_ready_ms"
  printf 'window_ready_ms=%s\n' "$window_ready_ms"
  printf 'scenario_elapsed_ms=%s\n' "$scenario_elapsed_ms"
  printf 'total_elapsed_ms=%s\n' "$total_elapsed_ms"
} >"$artifact_dir/timings.txt"

log "virtual desktop smoke passed scenario=$scenario_name display=$display port=$port window_id=$SWARM_WINDOW_ID window_pid=$SWARM_WINDOW_PID app_session=$app_session"
log "timings x_ready_ms=$x_ready_ms wm_ready_ms=$wm_ready_ms port_ready_ms=$port_ready_ms window_ready_ms=$window_ready_ms scenario_ms=$scenario_elapsed_ms total_ms=$total_elapsed_ms"
log "artifacts=$artifact_dir"
