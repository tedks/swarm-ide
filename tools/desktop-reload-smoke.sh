#!/usr/bin/env bash
set -euo pipefail
script_dir=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
workspace=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(cd "$script_dir/.." && pwd)}}
# All destructive edits happen in an owned disposable copy, never the developer's
# worktree. Include current tracked bytes so this also verifies uncommitted fixes.
scratch=$(mktemp -d "${TMPDIR:-/tmp}/swarm-reload-scenario.XXXXXX")
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -d "$scratch/repo" ]]; then
    (cd "$scratch/repo" && bazel shutdown) >/dev/null 2>&1 || true
  fi
  rm -rf -- "$scratch"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir "$scratch/repo"
(cd "$workspace" && git ls-files -z | tar --null -T - -cf -) | tar -xf - -C "$scratch/repo"
git -C "$scratch/repo" init -q
git -C "$scratch/repo" add .
git -C "$scratch/repo" -c user.name='Swarm reload scenario' -c user.email='scenario@localhost' -c commit.gpgsign=false commit -qm 'Seed disposable reload world'
(cd "$scratch/repo" && pnpm install --frozen-lockfile)
export SWARM_SOURCE_WORKSPACE="$scratch/repo"
export SWARM_ARTIFACT_DIR=${SWARM_ARTIFACT_DIR:-$workspace/artifacts/reload-smoke/$(date -u +%Y%m%dT%H%M%SZ)-$$}
"$script_dir/virtual-desktop-run.sh" "$script_dir/desktop-reload-scenario.sh" "$script_dir/dev.sh" reload-smoke
