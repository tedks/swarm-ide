// Test-only local Git input. No fixture provider or renderer injection.
import { execFileSync } from "node:child_process";
import { lstat, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
const owner = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!owner || !isAbsolute(owner) || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY)
  throw new Error("Owned virtual X11 required");
const stat = await lstat(owner);
if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0 ||
    (await readFile(join(owner, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN)
  throw new Error("Invalid virtual owner");
const root = await mkdtemp(join(owner, "service-observation-demo-"));
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" };
for (const key of Object.keys(env)) if (key.startsWith("GIT_") && !["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_TERMINAL_PROMPT"].includes(key)) delete env[key];
const git = (args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: root, env, timeout: 3000, stdio: "pipe" });
await writeFile(join(root, "README.md"), "# Service observation demo\n\nThis real Git repository has no configured service topology extractor.\nAn empty Service canvas must not claim that the repository contains no services.\n");
git(["init", "--initial-branch=main"]); git(["add", "README.md"]);
git(["-c", "user.name=Service observation proof", "-c", "user.email=proof@example.invalid", "-c", "commit.gpgSign=false", "commit", "-m", "Create disposable service observation repository"]);
console.log(root);
