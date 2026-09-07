import { execFileSync } from "node:child_process";
import { mkdir, writeFile, realpath } from "node:fs/promises";
import { join } from "node:path";

const source = await realpath(process.argv[2]);
const scratch = await realpath(process.env.SWARM_INSTALL_SCRATCH);
const evidence = await realpath(process.env.SWARM_INSTALL_EVIDENCE);
const checkout = join(scratch, "checkout"), target = join(scratch, "target repo");
const git = (cwd, args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
  cwd, encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" },
}).trim();
const head = git(source, ["rev-parse", "HEAD"]);
// A local transport copies committed objects, not source dependencies, config,
// private ignored artifacts, symlinks into the source or uncommitted files.
git(scratch, ["clone", "--no-local", "--no-checkout", "--single-branch", "--branch", git(source, ["branch", "--show-current"]), source, checkout]);
git(checkout, ["checkout", "--detach", head]);
let taskBranch;
try {
  git(checkout, ["show-ref", "--verify", "refs/heads/ditz-metadata"]);
  throw new Error("Single-branch clean clone unexpectedly already contains local Ditz branch");
} catch (error) { if (!error.status) throw error; }
git(checkout, ["fetch", "origin", "refs/heads/ditz-metadata:refs/heads/ditz-metadata"]);
taskBranch = git(checkout, ["rev-parse", "refs/heads/ditz-metadata"]);
const taskFiles = git(checkout, ["ls-tree", "-r", "--name-only", "refs/heads/ditz-metadata"]).split("\n");
if (!taskFiles.some((path) => path.endsWith(".yaml"))) throw new Error("Fetched Ditz branch lacks actual YAML records");
await mkdir(join(target, "src"), { recursive: true }); await mkdir(join(target, "tools"));
await writeFile(join(target, "src", "hello.ts"), '// Actual file in the selected non-Bazel repository.\nexport const message = "Hello from the chosen repository";\n');
await writeFile(join(target, "tools", "dev.sh"), "#!/bin/sh\nexit 93 # must never be executed by the IDE launcher\n", { mode: 0o755 });
await writeFile(join(target, "tools", "bazel"), "#!/bin/sh\nexit 94 # selected repo is data, not launcher code\n", { mode: 0o755 });
git(target, ["init", "-q"]); git(target, ["add", "."]);
git(target, ["-c", "user.name=Swarm installation proof", "-c", "user.email=proof@example.invalid", "commit", "-qm", "Actual disposable non-Bazel repository"]);
await writeFile(join(evidence, "installation-inputs.json"), JSON.stringify({
  head, source, checkout, target, taskBranch, taskYamlFiles: taskFiles.filter((path) => path.endsWith(".yaml")).length,
  sourceTransport: "local Git clone --no-local; committed source only", dependencies: "new node_modules; shared warm Nix/pnpm download stores allowed", modelTurns: 0,
}, null, 2));
