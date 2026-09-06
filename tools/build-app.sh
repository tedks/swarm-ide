#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: build-app.sh <output-tar> <workspace-package-json>" >&2
  exit 2
fi

output="$1"
manifest=$(readlink -f "$2")
workspace=$(dirname "$manifest")
if [[ "$output" != /* ]]; then
  output="$(pwd)/$output"
fi

bundle_dir=$(mktemp -d)
cleanup() {
  rm -rf "$bundle_dir"
}
trap cleanup EXIT

cd "$workspace"
pnpm exec esbuild app/electron/main.ts --bundle --platform=node --format=cjs --target=node22 --external:electron --outfile="$bundle_dir/app/electron/main.js"
pnpm exec esbuild app/electron/preload.ts --bundle --platform=node --format=cjs --target=node22 --external:electron --outfile="$bundle_dir/app/electron/preload.js"
pnpm exec esbuild core/worker.ts --bundle --platform=node --format=cjs --target=node22 --external:electron --outfile="$bundle_dir/core/worker.js"
# The fixed, terminable metadata worker resolves yaml with Node's resolver.
# Bundle only that pinned module beside core; never require source node_modules.
pnpm exec esbuild node_modules/yaml/dist/index.js --bundle --platform=node --format=cjs --target=node22 --outfile="$bundle_dir/core/node_modules/yaml/index.js"
cp node_modules/yaml/LICENSE "$bundle_dir/core/node_modules/yaml/LICENSE"
pnpm exec esbuild core/agents/owner-process.mjs --bundle --platform=node --format=cjs --target=node22 --outfile="$bundle_dir/core/agents/owner-process.js"
pnpm exec vite build --base ./ --outDir "$bundle_dir/renderer"
tar -C "$bundle_dir" -czf "$output" app core renderer
