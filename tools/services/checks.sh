#!/usr/bin/env bash
set -euo pipefail
service_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$service_workspace"
pnpm exec vitest run tests/service-discovery.test.ts tests/provider.test.ts tests/provider-boundary.test.ts tests/provider-build-command.test.ts tests/repository-provider.test.ts tests/service-declaration-context.test.ts tests/build-progress.test.ts tests/project-build-compatibility.test.ts tests/agent-context.test.ts tests/agent-production.test.ts tests/demo-service-states.test.tsx
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
