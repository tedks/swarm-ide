#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_SYNTAX_EVIDENCE:?}/window-selected"
syntax_deadline=$((SECONDS + 90))
while [[ ! -s "$SWARM_SYNTAX_EVIDENCE/proof.json" ]]; do
  [[ ! -s "$SWARM_SYNTAX_EVIDENCE/failure.json" ]] || { cat "$SWARM_SYNTAX_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < syntax_deadline )) || { echo 'Syntax proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_SYNTAX_EVIDENCE/proof.json" <<'JS'
const assert = require('node:assert/strict');
const p = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
assert(p.ok && p.packagedCore && p.retained && p.diskUnchangedBeforeSave && p.savedOwnedFile);
assert.deepEqual(p.modelRequests, []);
assert.deepEqual(p.blockingErrors, []);
assert.deepEqual(Object.keys(p.colors).sort(), ['BUILD.bazel', 'README.md', 'flake.nix', 'main.py', 'settings.json', 'syntax.ts']);
console.log('Actual TS/JSON/Markdown/Bazel/Nix/Python colors; native edit/tab/cursor/camera retention; one owned save; no model requests.');
console.log('Accepted exact resize diagnostics:', p.acceptedResizeWarnings.length);
JS
swarm_window_capture "$SWARM_SYNTAX_EVIDENCE/syntax-window.png"
