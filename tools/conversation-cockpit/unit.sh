#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
cd "$scripts/../.."
pnpm run typecheck:internal
pnpm exec vitest run tools/conversation-cockpit/response.test.mjs tests/conversation-cockpit.test.tsx tests/session-steering*.test.tsx tests/agent-dock.test.tsx tests/fleet-cockpit-dock.test.tsx tests/agent-trusted-home.test.tsx tests/cockpit-app.test.tsx tests/external-agents*.test.ts tests/external-agents*.test.tsx tests/observed-activity.test.tsx
