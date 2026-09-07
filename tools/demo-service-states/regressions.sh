#!/usr/bin/env bash
set -euo pipefail
service_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$service_workspace"
pnpm exec vitest run tests/demo-service-states.test.tsx tests/graph-pane.test.tsx tests/graph-camera.test.tsx tests/service-graph-activation.test.tsx
