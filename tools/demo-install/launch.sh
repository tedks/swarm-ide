#!/usr/bin/env bash
set -euo pipefail
[[ "${DISPLAY:-}" == "${SWARM_X11_DISPLAY:?}" && "$DISPLAY" != :0 && -d "${SWARM_X11_OWNERSHIP_DIR:?}" ]] || exit 2
cd "${SWARM_INSTALL_CHECKOUT:?}"
unset BUILD_WORKSPACE_DIRECTORY BUILD_WORKING_DIRECTORY SWARM_WORKSPACE_ROOT SWARM_AGENT_STORE_ROOT SWARM_DEV_CONTROL SWARM_RENDERER_URL NODE_OPTIONS ELECTRON_RUN_AS_NODE
if [[ "${SWARM_INSTALL_CASE:?}" == checkout ]]; then
  exec nix develop --command bazel run --jobs=3 //:dev
fi
if [[ "$SWARM_INSTALL_CASE" == bazel-target ]]; then
  exec nix develop --command bazel run --jobs=3 //:dev -- --workspace "$SWARM_INSTALL_SCRATCH/bazel target"
fi
exec nix develop --command bazel run --jobs=3 //:dev -- --workspace "${SWARM_INSTALL_TARGET:?}"
