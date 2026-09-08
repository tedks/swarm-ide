#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
cd "$scripts/../.."
for script in tools/task-runs/*.sh; do bash -n "$script"; done
for script in tools/task-runs/*.mjs tools/task-runs/*.cjs; do node --check "$script"; done
exec pnpm exec vitest run tests/task-trusted-runs.test.tsx
