#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
source_root=${BUILD_WORKSPACE_DIRECTORY:?Run through Bazel}
evidence_root=${SWARM_ARTIFACT_DIR:-$source_root/artifacts/demo-install}
[[ "$evidence_root" == /* ]] || { echo 'Demo install evidence path must be absolute'; exit 2; }
mkdir -p "$evidence_root"
export SWARM_INSTALL_EVIDENCE
SWARM_INSTALL_EVIDENCE=$(mktemp -d "$evidence_root/run.XXXXXX")
export SWARM_INSTALL_SCRATCH
SWARM_INSTALL_SCRATCH=$(mktemp -d /tmp/swarm-demo-install.XXXXXX)
cleanup_checkout() {
  if [[ -d "$SWARM_INSTALL_SCRATCH/checkout/.git" ]]; then
    (cd "$SWARM_INSTALL_SCRATCH/checkout" && nix develop --command bazel shutdown) >>"$SWARM_INSTALL_EVIDENCE/cleanup.log" 2>&1 || true
  fi
  echo "Owned disposable checkout retained for evidence: $SWARM_INSTALL_SCRATCH"
}
trap cleanup_checkout EXIT
node "$scripts/prepare.mjs" "$source_root"
export SWARM_INSTALL_CHECKOUT="$SWARM_INSTALL_SCRATCH/checkout"
export SWARM_INSTALL_TARGET="$SWARM_INSTALL_SCRATCH/target repo"

# New node_modules and Bazel output roots. Shared pinned Nix/pnpm download caches
# are intentionally retained; logs say this is not a cold-download benchmark.
(
  cd "$SWARM_INSTALL_CHECKOUT"
  nix develop --command pnpm install --frozen-lockfile
  nix develop --command bazel build --jobs=3 //:desktop-bundle
  nix develop --command bazel test --jobs=3 //tools:dev-workspace-test
) >"$SWARM_INSTALL_EVIDENCE/materialization.log" 2>&1

for install_case in checkout target; do
  export SWARM_INSTALL_CASE="$install_case"
  export SWARM_ARTIFACT_DIR="$SWARM_INSTALL_EVIDENCE/$install_case"
  mkdir -p "$SWARM_ARTIFACT_DIR"
  SWARM_SOURCE_WORKSPACE="$SWARM_INSTALL_CHECKOUT" SWARM_APP_START_TIMEOUT_MS=90000 \
    "$SWARM_INSTALL_CHECKOUT/tools/virtual-desktop-run.sh" \
    "$SWARM_INSTALL_CHECKOUT/tools/demo-install/scenario.sh" \
    "$SWARM_INSTALL_CHECKOUT/tools/demo-install/launch.sh" "demo-install-$install_case"
  grep -q 'cleanup_complete=1 ' "$SWARM_ARTIFACT_DIR/supervisor.log"
done
git -C "$SWARM_INSTALL_CHECKOUT" status --porcelain >"$SWARM_INSTALL_EVIDENCE/checkout-status.txt"
git -C "$SWARM_INSTALL_TARGET" status --porcelain >"$SWARM_INSTALL_EVIDENCE/target-status.txt"
[[ ! -s "$SWARM_INSTALL_EVIDENCE/checkout-status.txt" && ! -s "$SWARM_INSTALL_EVIDENCE/target-status.txt" ]]
[[ ! -e "$SWARM_INSTALL_TARGET/target-wrapper-ran" ]]
echo "Actual clean-checkout dev launch and second repository passed: $SWARM_INSTALL_EVIDENCE"
