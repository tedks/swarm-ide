#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
cd "$scripts/../.."
exec pnpm exec vitest run tests/startup-topology.test.tsx
