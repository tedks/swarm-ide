#!/usr/bin/env bash
set -euo pipefail
umask 077
source /opt/runtime/etc/swarm/runtime.env
if [[ $(id -u) == 0 ]]; then
  echo 'Run the demo as its default non-root user, not root.' >&2
  exit 2
fi
if [[ $# -gt 1 || (${1:-} != '' && ${1:-} != /*) ]]; then
  echo 'Usage: container [absolute path to an explicitly mounted Git working tree]' >&2
  exit 2
fi
mkdir -p "$XDG_RUNTIME_DIR" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"
chmod 700 "$XDG_RUNTIME_DIR"
workspace=${1:-/data/demo}
if [[ $# == 0 && ! -e /data/demo ]]; then
  cp -R /opt/demo /data/demo
  mv /data/demo/BUILD.demo /data/demo/BUILD.bazel
  chmod -R u+w /data/demo
  git -C /data/demo init --initial-branch=main --quiet
  git -C /data/demo -c user.name='Swarm demo' -c user.email='demo@example.invalid' add .
  git -C /data/demo -c user.name='Swarm demo' -c user.email='demo@example.invalid' commit --quiet -m 'Start the included architecture demo'
fi
if [[ ! -d "$workspace" ]] || ! git -C "$workspace" rev-parse --verify HEAD >/dev/null 2>&1; then
  echo 'The workspace must be a readable Git working tree with a committed HEAD. Mount a clone, not a bare repo or worktree .git pointer outside the mount.' >&2
  exit 2
fi
workspace=$(realpath "$workspace")
[[ "$(git -C "$workspace" rev-parse --show-toplevel)" == "$workspace" ]] || {
  echo 'Select the repository root, not an inner directory.' >&2; exit 2;
}
# Electron must be able to create its sandbox; do not retry without one.
if ! unshare --user --map-root-user --pid --fork true; then
  echo 'Electron sandbox namespaces are denied. Use the documented scoped seccomp profile and a host that supports unprivileged user namespaces; do not use --no-sandbox or --privileged.' >&2
  exit 3
fi
export SWARM_WORKSPACE_ROOT="$workspace"
export XAUTHORITY="$XDG_RUNTIME_DIR/Xauthority"
touch "$XAUTHORITY"
xauth -f "$XAUTHORITY" add "$DISPLAY" . "$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
children=()
cleanup() {
  local result=$?
  trap - EXIT TERM INT
  for child in "${children[@]}"; do kill -TERM "$child" 2>/dev/null || true; done
  for child in "${children[@]}"; do wait "$child" 2>/dev/null || true; done
  exit "$result"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
Xvfb "$DISPLAY" -screen 0 1600x1000x24 -nolisten tcp -auth "$XAUTHORITY" &
children+=("$!")
# Even localhost browser sessions authenticate before receiving pixels/control.
browser_password=$(head -c 6 /dev/urandom | base64)
printf '%s' "$browser_password" > "$XDG_RUNTIME_DIR/browser-password"
x11vnc -storepasswd "$browser_password" "$XDG_RUNTIME_DIR/vnc-password" >/dev/null
for ((attempt=0; attempt<100; attempt++)); do
  xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 && break
  kill -0 "${children[0]}" 2>/dev/null || exit 4
  sleep 0.1
done
xdpyinfo -display "$DISPLAY" >/dev/null
openbox & children+=("$!")
# VNC is private to this container. Only websockify's HTTP/WebSocket port is published.
x11vnc -display "$DISPLAY" -auth "$XAUTHORITY" -localhost -rfbport 5900 -forever -shared -rfbauth "$XDG_RUNTIME_DIR/vnc-password" -noxdamage &
children+=("$!")
websockify --web=/opt/novnc 6080 127.0.0.1:5900 & children+=("$!")
cd "$workspace"
dbus-run-session --config-file=/opt/runtime/share/dbus-1/session.conf -- electron /opt/swarm/app/electron/main.js & children+=("$!")
echo 'Swarm desktop starting. Open http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale (or your configured host port).'
echo "This launch's desktop password: $browser_password"
unset browser_password
set +e
wait -n "${children[@]}"
result=$?
set -e
exit "$result"
