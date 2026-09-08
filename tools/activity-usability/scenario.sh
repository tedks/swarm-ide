#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_ACTIVITY_USABILITY_EVIDENCE:?}/window-selected"
activity_deadline=$((SECONDS + 45))
while [[ ! -s "$SWARM_ACTIVITY_USABILITY_EVIDENCE/proof.json" ]]; do
  [[ ! -s "$SWARM_ACTIVITY_USABILITY_EVIDENCE/failure.json" ]] || { cat "$SWARM_ACTIVITY_USABILITY_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < activity_deadline )) || { echo 'Activity usability journey timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_ACTIVITY_USABILITY_EVIDENCE/proof.json" <<'JS'
const proof = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (!proof.ok || !proof.packagedCore || !proof.retained || !proof.keyboard || !proof.rawActivity ||
    !proof.exactTimestamps || !proof.sourceDiskUnchanged || proof.unexpectedMutations.length ||
    proof.startupBuildRequests.length > 1 || proof.rendererErrors.length || proof.interactionMilliseconds >= 15000) process.exit(1);
if (process.env.SWARM_ACTIVITY_CENTRAL_REFRESH === '1' && (!proof.centralRefresh?.currentFleet || !proof.centralRefresh.manualFleetRead || !proof.centralRefresh.separateOverview || !proof.centralRefresh.retained)) process.exit(1);
console.log('Packaged Activity: two labelled local fixtures, raw command/edit events, exact timestamps, keyboard settings, source/draft/camera retention. No model messages or source writes.');
JS
swarm_window_capture "$SWARM_ACTIVITY_USABILITY_EVIDENCE/window.png"
