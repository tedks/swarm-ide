#!/usr/bin/env bash
set -euo pipefail
cockpit_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$cockpit_workspace"
pnpm run typecheck:internal
pnpm exec vitest run tests/registered-conversation-tabs.test.tsx tests/conversation-scroll.test.tsx tests/conversation-cockpit.test.tsx tests/agent-dock.test.tsx tests/message-outbox.test.tsx tests/chat-input.test.tsx tests/living-design.test.tsx
