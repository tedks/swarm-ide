#!/usr/bin/env bash
set -euo pipefail
cd "${BUILD_WORKSPACE_DIRECTORY:-$PWD}"
pnpm exec vitest run tests/target-build-jobs.test.ts
