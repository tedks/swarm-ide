#!/usr/bin/env bash
set -euo pipefail
resources_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$resources_workspace"
exec pnpm run test:internal tests/build-resources.test.tsx tests/build-resource-stats.test.ts
