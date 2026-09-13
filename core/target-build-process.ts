import { constants, existsSync } from "node:fs";
import { access, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createOwnedCodexTransport } from "./agents/owner";
import type { CodexTransport, CodexTransportSink } from "./agents/codex-app-server";
import { watchBuildProgress } from "./build-progress";
import { TargetBuildOperationSchema, type TargetBuildOperation } from "../protocol/build-jobs";

export interface TargetBuildResult {
  exitCode: number | null;
  cleanup: "confirmed" | "unknown";
  output: string;
  error?: string;
}
export interface TargetBuildExecutor {
  run(target: string, signal: AbortSignal, progress: (message: string) => void, operation?: TargetBuildOperation): Promise<TargetBuildResult>;
  dispose(): Promise<void>;
}

/** Keep a small readable tail; never interpret terminal escape/control bytes. */
export function buildOutputText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "").slice(-4096);
}

/** Exit is not cleanup. Close the owner, drain its output, then report the result. */
export function collectTargetBuild(connect: (sink: CodexTransportSink) => CodexTransport, signal: AbortSignal,
  timeoutMs = 15 * 60_000, operation: TargetBuildOperation = "build", launchTool?: string,
  observeOutput?: (output: string) => void): Promise<TargetBuildResult> {
  const activity = operation === "test" ? "Tests" : "Build";
  return new Promise((resolve, reject) => {
    if (signal.aborted) { resolve({ exitCode: null, cleanup: "confirmed", output: "", error: `${activity} cancelled before launch` }); return; }
    let transport: CodexTransport | undefined, closing: ReturnType<CodexTransport["close"]> | undefined;
    let exited = false, ended = false, finishing = false, code: number | null = null, error: string | undefined;
    let tail = Buffer.alloc(0), total = 0;
    const close = () => closing ??= transport!.close();
    const finish = () => {
      if (finishing || !transport) return;
      finishing = true; clearTimeout(timer); signal.removeEventListener("abort", abort);
      void close().then((evidence) => resolve({ exitCode: code, cleanup: evidence.status === "confirmed" ? "confirmed" : "unknown", output: buildOutputText(tail), ...(error ? { error } : {}) }),
        () => resolve({ exitCode: code, cleanup: "unknown", output: buildOutputText(tail), error: `${activity} process cleanup could not be confirmed` }));
    };
    const abort = () => { error = `${activity} cancelled`; finish(); };
    const timer = setTimeout(() => { error = `${activity} exceeded ${operation === "test" ? "their" : "its"} 15-minute time limit`; finish(); }, timeoutMs);
    const consume = (bytes: Uint8Array) => {
      total += bytes.byteLength;
      tail = Buffer.concat([tail, bytes]).subarray(-8192);
      observeOutput?.(buildOutputText(tail));
      if (total > 8 * 1024 * 1024) { error = `${activity} output exceeded its 8 MiB limit`; finish(); }
    };
    try {
      transport = connect({ stdout: consume, stderr: consume,
        end() { ended = true; if (exited) finish(); },
        exit(value) {
          exited = true; code = value;
          // The guardian emits pipe EOF only after the control pipe is closed.
          if (transport) void close().then((evidence) => { if (evidence.status !== "confirmed" || ended) finish(); }, () => { error = `${activity} cleanup failed`; finish(); });
          if (ended) finish();
        },
        error() { error = launchTool ? `${launchTool} could not start` : operation === "test" ? "Tests could not start" : "Bazel could not start"; finish(); },
      });
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      else if (error || exited && ended) finish();
      else if (exited) void close();
    } catch (failure) {
      clearTimeout(timer); signal.removeEventListener("abort", abort); reject(failure);
    }
  });
}

async function executable(name: string): Promise<string> {
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter((path) => path.startsWith("/"))) {
    try { const path = await realpath(join(directory, name)); await access(path, constants.X_OK); return path; } catch { /* next */ }
  }
  throw new Error(`Required ${name} executable is unavailable`);
}

async function pathIs(path: string, kind: "file" | "directory"): Promise<boolean> {
  try {
    const value = await stat(path);
    return kind === "file" ? value.isFile() : value.isDirectory();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}

const missingPnpmDependency = /ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL[^\n]*(?:command|executable)[^\n]*not found/i;

async function dependencySetupError(root: string, result: TargetBuildResult): Promise<string | undefined> {
  if (result.exitCode === 0 || result.error || !missingPnpmDependency.test(result.output) ||
      !await pathIs(join(root, "pnpm-lock.yaml"), "file") || await pathIs(join(root, "node_modules"), "directory")) return undefined;
  return "Project dependencies are not materialized. Run nix develop --command pnpm install --frozen-lockfile in this workspace, then retry";
}

/** One private Bazel cache per opened workspace/core lifetime; no shared server. */
export function createTargetBuildExecutor(root: string): TargetBuildExecutor {
  let scratch: Promise<string> | undefined, blocked = false;
  return {
    async run(target, signal, progress, operation = "build") {
      TargetBuildOperationSchema.parse(operation);
      if (blocked) throw new Error("Previous build cleanup is unresolved");
      const [node, unshare, setpriv] = await Promise.all(["node", "unshare", "setpriv"].map(executable));
      const flake = await pathIs(join(root, "flake.nix"), "file");
      const bazel = process.env.SWARM_BAZEL_BIN, java = process.env.SWARM_BAZEL_JAVA_HOME;
      if (!bazel?.startsWith("/nix/store/") || !java?.startsWith("/nix/store/") ||
          !/\/bazel-7\.[0-9.]+-linux-(x86_64|aarch64)$/.test(bazel)) throw new Error("Launch Swarm through its Nix package to use the pinned Bazel runtime");
      await Promise.all([access(bazel, constants.X_OK), access(join(java, "bin/java"), constants.X_OK)]);
      const directory = await (scratch ??= mkdtemp(join(tmpdir(), "swarm-target-build-")));
      const events = join(directory, `events-${Date.now()}.jsonl`);
      const started = join(directory, `bazel-started-${randomUUID()}`);
      const bazelArgs = ["--batch", "--nosystem_rc", "--nohome_rc", "--host_jvm_args=-Xmx512m", "--host_jvm_args=-XX:ActiveProcessorCount=3",
        `--server_javabase=${java}`, `--output_user_root=${directory}`, `--output_base=${join(directory, "output")}`,
        operation, "--jobs=3", "--color=no", "--curses=no", `--build_event_json_file=${events}`,
        // A selected test is explicit intent, even if workspace-wide test
        // defaults filter manual targets or disable build execution.
        ...(operation === "test" ? ["--build", "--test_output=errors", "--test_tag_filters="] : []), "--", target];
      let command = bazel, args = bazelArgs;
      if (flake) {
        progress("Preparing project development environment");
        try { command = await executable("nix"); }
        catch { throw new Error("This project's Nix development environment cannot be prepared because the Nix executable is unavailable"); }
        const launcher = join(__dirname, "target-build-launcher.mjs");
        await access(launcher, constants.R_OK);
        args = ["develop", "--no-update-lock-file", "--command", node!, launcher, started, bazel, ...bazelArgs];
      }
      const reader = watchBuildProgress(events, (message) => progress(operation === "test" ? `Tests: ${message}` : message));
      let announcedEnvironmentBuild = false;
      try {
        const result = await collectTargetBuild((sink) => createOwnedCodexTransport({ root, executable: command,
          nodeExecutable: node!, unshareExecutable: unshare!, setprivExecutable: setpriv!, ownerScript: join(__dirname, "agents/owner-process.js"),
          args }, sink), signal, undefined, operation, flake ? "Nix" : undefined, flake ? (output) => {
            if (!announcedEnvironmentBuild && !existsSync(started) && /building '\/nix\/store\/[^']+\.drv'/.test(output)) {
              announcedEnvironmentBuild = true;
              progress("Building project development environment");
            }
          } : undefined);
        blocked = result.cleanup !== "confirmed";
        if (flake && !signal.aborted && !await pathIs(started, "file")) {
          const detail = result.error ? `: ${result.error}` : " without changing its lock file; inspect the retained Nix output";
          return { ...result, error: `Project development environment could not be prepared${detail}` };
        }
        const setupError = flake ? await dependencySetupError(root, result) : undefined;
        if (setupError) return { ...result, error: setupError };
        return result;
      } finally { await reader.stop(); }
    },
    async dispose() {
      if (blocked) throw new Error("Build cleanup is unresolved; retaining private cache");
      if (scratch) await rm(await scratch, { recursive: true, force: true });
    },
  };
}
