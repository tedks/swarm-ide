import { constants } from "node:fs";
import { access, mkdtemp, realpath, rm } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { createOwnedCodexTransport } from "./agents/owner";
import type { CodexTransport, CodexTransportSink } from "./agents/codex-app-server";
import { watchBuildProgress } from "./build-progress";

export interface TargetBuildResult {
  exitCode: number | null;
  cleanup: "confirmed" | "unknown";
  output: string;
  error?: string;
}
export interface TargetBuildExecutor {
  run(target: string, signal: AbortSignal, progress: (message: string) => void): Promise<TargetBuildResult>;
  dispose(): Promise<void>;
}

/** Keep a small readable tail; never interpret terminal escape/control bytes. */
export function buildOutputText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "").slice(-4096);
}

/** Exit is not cleanup. Close the owner, drain its output, then report the result. */
export function collectTargetBuild(connect: (sink: CodexTransportSink) => CodexTransport, signal: AbortSignal,
  timeoutMs = 15 * 60_000): Promise<TargetBuildResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { resolve({ exitCode: null, cleanup: "confirmed", output: "", error: "Build cancelled before launch" }); return; }
    let transport: CodexTransport | undefined, closing: ReturnType<CodexTransport["close"]> | undefined;
    let exited = false, ended = false, finishing = false, code: number | null = null, error: string | undefined;
    let tail = Buffer.alloc(0), total = 0;
    const close = () => closing ??= transport!.close();
    const finish = () => {
      if (finishing || !transport) return;
      finishing = true; clearTimeout(timer); signal.removeEventListener("abort", abort);
      void close().then((evidence) => resolve({ exitCode: code, cleanup: evidence.status === "confirmed" ? "confirmed" : "unknown", output: buildOutputText(tail), ...(error ? { error } : {}) }),
        () => resolve({ exitCode: code, cleanup: "unknown", output: buildOutputText(tail), error: "Build process cleanup could not be confirmed" }));
    };
    const abort = () => { error = "Build cancelled"; finish(); };
    const timer = setTimeout(() => { error = "Build exceeded its 15-minute time limit"; finish(); }, timeoutMs);
    const consume = (bytes: Uint8Array) => {
      total += bytes.byteLength;
      tail = Buffer.concat([tail, bytes]).subarray(-8192);
      if (total > 8 * 1024 * 1024) { error = "Build output exceeded its 8 MiB limit"; finish(); }
    };
    try {
      transport = connect({ stdout: consume, stderr: consume,
        end() { ended = true; if (exited) finish(); },
        exit(value) {
          exited = true; code = value;
          // The guardian emits pipe EOF only after the control pipe is closed.
          if (transport) void close().then((evidence) => { if (evidence.status !== "confirmed" || ended) finish(); }, () => { error = "Build cleanup failed"; finish(); });
          if (ended) finish();
        },
        error() { error = "Bazel could not start"; finish(); },
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

/** One private Bazel cache per opened workspace/core lifetime; no shared server. */
export function createTargetBuildExecutor(root: string): TargetBuildExecutor {
  let scratch: Promise<string> | undefined, blocked = false;
  return {
    async run(target, signal, progress) {
      if (blocked) throw new Error("Previous build cleanup is unresolved");
      const [node, unshare, setpriv] = await Promise.all(["node", "unshare", "setpriv"].map(executable));
      const bazel = process.env.SWARM_BAZEL_BIN, java = process.env.SWARM_BAZEL_JAVA_HOME;
      if (!bazel?.startsWith("/nix/store/") || !java?.startsWith("/nix/store/") ||
          !/\/bazel-7\.[0-9.]+-linux-(x86_64|aarch64)$/.test(bazel)) throw new Error("Launch Swarm through its Nix package to use the pinned Bazel runtime");
      await Promise.all([access(bazel, constants.X_OK), access(join(java, "bin/java"), constants.X_OK)]);
      const directory = await (scratch ??= mkdtemp(join(tmpdir(), "swarm-target-build-")));
      const events = join(directory, `events-${Date.now()}.jsonl`);
      const reader = watchBuildProgress(events, progress);
      try {
        const result = await collectTargetBuild((sink) => createOwnedCodexTransport({ root, executable: bazel,
          nodeExecutable: node!, unshareExecutable: unshare!, setprivExecutable: setpriv!, ownerScript: join(__dirname, "agents/owner-process.js"),
          args: ["--batch", "--nosystem_rc", "--nohome_rc", "--host_jvm_args=-Xmx512m", "--host_jvm_args=-XX:ActiveProcessorCount=3",
            `--server_javabase=${java}`, `--output_user_root=${directory}`, `--output_base=${join(directory, "output")}`,
            "build", "--jobs=3", "--color=no", "--curses=no", `--build_event_json_file=${events}`, "--", target] }, sink), signal);
        blocked = result.cleanup !== "confirmed";
        return result;
      } finally { await reader.stop(); }
    },
    async dispose() {
      if (blocked) throw new Error("Build cleanup is unresolved; retaining private cache");
      if (scratch) await rm(await scratch, { recursive: true, force: true });
    },
  };
}
