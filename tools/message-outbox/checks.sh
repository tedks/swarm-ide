#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
cd "$scripts/../.."
pnpm run typecheck:internal
pnpm exec vitest run tests/message-outbox.test.tsx tests/external-agents-send.test.ts tests/conversation-cockpit.test.tsx tests/session-steering-ui.test.tsx tests/session-steering-navigation.test.tsx tests/chat-input.test.tsx tests/editor-observation-stability.test.tsx
