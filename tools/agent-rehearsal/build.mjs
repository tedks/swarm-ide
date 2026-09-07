import { build } from "esbuild";
import { build as buildRenderer } from "vite";
import { resolve } from "node:path";
import { copyFile, mkdir, writeFile } from "node:fs/promises";

const [output] = process.argv.slice(2);
if (!output) throw new Error("Owned Bazel build output required");
await mkdir(output, { recursive: true });
process.env.VITE_SWARM_AGENT_DEMO = "0";
const source = process.cwd();
const result = await build({ entryPoints: {
  "app/electron/main": "tests/support/agent-rehearsal-main.ts",
  "app/electron/task-main": "tests/support/task-rehearsal-main.ts",
  "app/electron/preload": "app/electron/preload.ts",
  "core/worker": "tests/support/agent-rehearsal-worker.ts",
}, bundle: true, platform: "node", format: "cjs", target: "node22", external: ["electron"], outdir: output, metafile: true,
plugins: [{ name: "fixed-rehearsal-core-observer", setup(builder) {
  builder.onResolve({ filter: /^\.\/core-launch$/ }, (args) => {
    if (args.importer === resolve(source, "app/electron/main.ts")) return { path: resolve(source, "tests/support/agent-rehearsal-launch.ts") };
  });
} }], });
await writeFile(resolve(output, "rehearsal-inputs.json"), JSON.stringify(Object.keys(result.metafile.inputs).sort(), null, 2));
// The same owned YAML worker as production resolves this archive-local module.
await build({ entryPoints: ["node_modules/yaml/dist/index.js"], bundle: true, platform: "node", format: "cjs",
  target: "node22", outfile: resolve(output, "core/node_modules/yaml/index.js") });
await copyFile("node_modules/yaml/LICENSE", resolve(output, "core/node_modules/yaml/LICENSE"));
await buildRenderer({ configFile: resolve("vite.config.mts"), base: "./", build: { outDir: resolve(output, "renderer"), emptyOutDir: true } });
