#!/usr/bin/env bash
set -euo pipefail
activity_scripts=$(dirname "$(readlink -f "$0")")
cd "$(dirname "$(dirname "$activity_scripts")")"
pnpm exec vitest run tests/github-prs.test.ts tests/github-prs-ui.test.tsx tests/journal.test.ts tests/journal-ui.test.tsx tests/agent-dock.test.tsx
