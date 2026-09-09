#!/usr/bin/env bash
set -euo pipefail
proof_output=$(readlink -m "$1")
cd "$(dirname "$(readlink -f "$2")")"
pnpm exec esbuild tools/renderer-health/proof-renderer.tsx --bundle --platform=browser --format=esm --target=chrome130 \
  --define:import.meta.env='{"DEV":false,"PROD":true,"VITE_SWARM_AGENT_DEMO":"0"}' --define:import.meta.hot=undefined \
  --define:process.env.NODE_ENV='"production"' --outfile="$proof_output"
