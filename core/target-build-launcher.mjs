import { closeSync, openSync } from "node:fs";
import { spawn } from "node:child_process";

const [startedPath, executable, ...args] = process.argv.slice(2);
if (!startedPath || !executable) {
  console.error("Invalid selected-target launcher arguments");
  process.exitCode = 2;
} else {
  try {
    closeSync(openSync(startedPath, "wx", 0o600));
    const child = spawn(executable, args, { shell: false, stdio: "inherit" });
    child.once("error", (error) => {
      console.error(`Bazel could not start: ${error.message}`);
      process.exitCode = 127;
    });
    child.once("exit", (code, signal) => {
      if (signal) console.error(`Bazel stopped by ${signal}`);
      process.exitCode = code ?? 1;
    });
  } catch (error) {
    console.error(`Bazel launcher could not start: ${error instanceof Error ? error.message : "unknown failure"}`);
    process.exitCode = 127;
  }
}
