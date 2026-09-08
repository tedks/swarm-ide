import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
const [output] = process.argv.slice(2);
if (!output) throw new Error("Owned Bazel output required");
await build({ entryPoints: ["tools/task-runs/controlled.tsx"], bundle: true, platform: "browser", format: "iife", target: "chrome130",
  outfile: join(output, "controlled.js"), define: { "process.env.NODE_ENV": '"production"' } });
await writeFile(join(output, "index.html"), '<!doctype html><html><head><meta charset="utf-8"><title>swarm-ide — Controlled task runs proof</title><link rel="stylesheet" href="controlled.css"></head><body><div id="root"></div><script src="controlled.js"></script></body></html>');
