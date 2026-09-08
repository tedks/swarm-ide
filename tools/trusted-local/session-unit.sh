#!/usr/bin/env bash
set -euo pipefail
trusted_activity_scripts=$(dirname "$(readlink -f "$0")")
cd "$(dirname "$(dirname "$trusted_activity_scripts")")"
pnpm exec vitest run tests/trusted-local-session.test.ts
