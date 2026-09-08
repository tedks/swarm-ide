import { execFileSync } from "node:child_process";
import { realpath } from "node:fs/promises";
import { discoverServices } from "../../core/service-discovery";

async function main() {
  if (process.argv.length < 3) throw new Error("Usage: bazel run //tools/services:inspect -- /absolute/repository ...");
  for (const input of process.argv.slice(2)) {
    const root = await realpath(input);
    const status = () => execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root, maxBuffer: 64 * 1024 * 1024, timeout: 10000 }).toString("base64");
    const before = status();
    const result = await discoverServices(root);
    if (before !== status()) throw new Error("Repository changed during read-only inspection; do not claim unchanged source.");
    console.log(JSON.stringify({ root, ...result, gitStatusUnchanged: true, serviceProcessesStarted: 0 }));
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
