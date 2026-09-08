import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdtemp, open, readlink, realpath, rm } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { BUILD_GRAPH_LIMITS as LIMITS, BuildGraphDataSchema, BuildGraphObservationSchema, type BuildGraphData, type BuildGraphObservation, type BuildTarget } from "../protocol/build-graph";
import { isRepositoryPath } from "../protocol/repository";
import { queryRepositoryGit } from "./repository-boundary";
import { createOwnedCodexTransport } from "./agents/owner";
import type { CodexTransport, CodexTransportSink } from "./agents/codex-app-server";

export class BuildQueryCleanupError extends Error {}

export const BUILD_QUERY = "//...:*";
export const BUILD_QUERY_ARGS = ["query", "--noimplicit_deps", "--notool_deps", "--output=streamed_jsonproto", "--proto:output_rule_attrs=", "--relative_locations", "--loading_phase_threads=3", "--repository_disable_download", "--lockfile_mode=off", BUILD_QUERY];
const COVERAGE = "Unconfigured local //...:* declarations, no implicit/tool deps; external targets unexpanded. Tracked + nonignored membership and BUILD/.bzl/module inputs observed; ignored/external/environment changes require Refresh. No compilation; standard repository loading, downloads disabled.";

function localPath(label: string, file: boolean): string | null {
  if (!label.startsWith("//")) return null;
  const [pkg, name] = label.slice(2).split(":");
  if (name === undefined) throw new Error("Malformed Bazel label");
  const path = file ? `${pkg ? `${pkg}/` : ""}${name}` : pkg!;
  if (!isRepositoryPath(path, !file)) throw new Error("Unsupported Bazel label path");
  return path;
}

/** Bazel Target protobuf JSON records carry authoritative kinds, including isolated rules. */
export function parseBuildQuery(output: Uint8Array): Pick<BuildGraphData, "targets" | "edges" | "complete" | "coverage"> {
  if (output.byteLength > LIMITS.bytes) throw new Error("Bazel query output exceeded byte bound");
  const decoded = new TextDecoder("utf8", { fatal: true }).decode(output);
  if (decoded && !decoded.endsWith("\n")) throw new Error("Truncated Bazel query record");
  const all = new Map<string, BuildTarget>(), inputs: Array<{ from: string; to: string }> = [];
  let complete = true;
  for (const line of decoded.split("\n").filter(Boolean)) {
    const value = JSON.parse(line);
    const fields = { RULE: ["rule", "rule"], SOURCE_FILE: ["sourceFile", "source"], GENERATED_FILE: ["generatedFile", "generated"], PACKAGE_GROUP: ["packageGroup", "package-group"], ENVIRONMENT_GROUP: ["environmentGroup", "environment-group"] } as const;
    const spec = fields[value.type as keyof typeof fields];
    if (!spec || !value[spec[0]] || typeof value[spec[0]].name !== "string") throw new Error("Unsupported Bazel target record");
    const record = value[spec[0]], name = record.name as string;
    const target: BuildTarget = { label: name, kind: spec[1], path: localPath(name, spec[1] === "source" || spec[1] === "generated") };
    if (target.kind === "rule") {
      if (typeof record.ruleClass !== "string") throw new Error("Missing rule class");
      target.ruleClass = record.ruleClass;
      const location = typeof record.location === "string" ? record.location.replace(/:\d+:\d+$/, "") : "";
      if (target.path !== null && ["BUILD", "BUILD.bazel"].some((file) => location === `${target.path ? `${target.path}/` : ""}${file}`)) target.buildFile = location;
    }
    if (all.has(name)) throw new Error("Duplicate Bazel target");
    if (all.size < LIMITS.targets) all.set(name, target); else complete = false;
    const dependencies = target.kind === "rule" ? record.ruleInput ?? [] : target.kind === "generated" ? [record.generatingRule] : [];
    if (!Array.isArray(dependencies) || dependencies.some((item) => typeof item !== "string")) throw new Error("Malformed Bazel inputs");
    for (const to of dependencies) {
      if (inputs.length < LIMITS.edges) inputs.push({ from: name, to }); else complete = false;
    }
  }
  for (const edge of inputs) {
    if (all.has(edge.from) && !all.has(edge.to) && all.size < LIMITS.targets) {
      all.set(edge.to, { label: edge.to, kind: "unresolved", path: null }); complete = false;
    }
  }
  const edges = [...new Map(inputs.filter((edge) => {
    if (all.has(edge.from) && all.has(edge.to)) return true;
    complete = false; return false;
  }).map((edge) => [JSON.stringify(edge), edge])).values()];
  return { targets: [...all.values()], edges, complete, coverage: `${complete ? "Complete returned query. " : "Partial bounded query; omitted targets/edges. "}${COVERAGE}` };
}

/** Bounded membership + build-definition sampling, independent of source keystrokes. */
export async function buildInputDigest(root: string, signal: AbortSignal): Promise<string | null> {
  const output = await queryRepositoryGit(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { signal, maximumBytes: LIMITS.inputBytes });
  const paths = [...new Set(new TextDecoder("utf8", { fatal: true }).decode(output).split("\0").filter(Boolean))].sort();
  if (paths.length > LIMITS.files || paths.some((path) => !isRepositoryPath(path))) throw new Error("Build input membership exceeds supported bound");
  let supported = false, total = 0;
  const hash = createHash("sha256").update("swarm-build-input-v1\0");
  for (const path of paths) {
    if (signal.aborted) throw new Error("Build input scan cancelled");
    hash.update(JSON.stringify(path));
    try {
      const stat = await lstat(join(root, path)); hash.update(stat.isFile() ? "file" : stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "link" : "special");
      if (stat.isSymbolicLink()) { const target = await readlink(join(root, path)); if (target.length > 4096) throw new Error("Build membership link exceeds bound"); hash.update(JSON.stringify(target)); }
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; hash.update("missing"); continue; }
    const definition = /(^|\/)(BUILD(?:\.bazel)?|WORKSPACE(?:\.bazel)?|MODULE\.bazel(?:\.lock)?|\.bazelignore)$/.test(path) || path.endsWith(".bzl");
    if (!definition) continue;
    let handle;
    try {
      handle = await open(join(root, path), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      if (await realpath(`/proc/self/fd/${handle.fd}`) !== join(root, path)) throw new Error("Build definition is not canonical");
      const before = await handle.stat({ bigint: true });
      if (!before.isFile() || before.size > BigInt(LIMITS.inputBytes - total)) throw new Error("Build definitions exceed byte bound");
      const bytes = Buffer.alloc(Number(before.size) + 1);
      let offset = 0;
      while (offset < bytes.length) { const read = await handle.read(bytes, offset, bytes.length - offset, offset); if (!read.bytesRead) break; offset += read.bytesRead; }
      const after = await handle.stat({ bigint: true });
      if (offset !== Number(before.size) || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error("Build definition changed during scan");
      total += offset; hash.update(`${offset}:`).update(bytes.subarray(0, offset));
      if (/^(WORKSPACE(?:\.bazel)?|MODULE\.bazel)$/.test(path)) supported = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ELOOP") throw new Error("Symlinked build definitions are unsupported; use regular in-repository BUILD/.bzl/module files.");
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      hash.update("missing");
    } finally { await handle?.close(); }
  }
  return supported ? hash.digest("hex") : null;
}

async function executable(name: string): Promise<string> {
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter((item) => item.startsWith("/"))) {
    const path = join(directory, name);
    try { await access(path, constants.X_OK); if ((await lstat(await realpath(path))).isFile()) return realpath(path); } catch { /* next trusted environment path */ }
  }
  throw new Error(`Required ${name} executable is unavailable`);
}

/** Reuse the independently tested private PID-namespace owner; never a shared Bazel server. */
export async function queryBuildGraph(root: string, signal: AbortSignal, trace?: (event: string, value: string) => void): Promise<Uint8Array> {
  const scratch = await mkdtemp(join(tmpdir(), "swarm-build-query-"));
  let retainScratch = false;
  try {
    const [node, unshare, setpriv] = await Promise.all(["node", "unshare", "setpriv"].map(executable));
    const bazel = process.env.SWARM_BAZEL_BIN, javaHome = process.env.SWARM_BAZEL_JAVA_HOME;
    if (!bazel?.startsWith("/nix/store/") || !javaHome?.startsWith("/nix/store/") ||
        !/\/bazel-7\.[0-9.]+-linux-(x86_64|aarch64)$/.test(bazel) || [bazel, javaHome].some((path) => /[\s\0]/.test(path) || path.includes("/../")))
      throw new Error("Configured pinned Bazel 7 and Java runtime unavailable; launch through the Swarm Nix environment.");
    await Promise.all([access(bazel, constants.X_OK), access(join(javaHome, "bin/java"), constants.X_OK)]);
    const ownerScript = join(__dirname, "agents/owner-process.js");
    await access(ownerScript);
    return await collectBuildQuery((sink) => createOwnedCodexTransport({ root, executable: bazel, nodeExecutable: node!, unshareExecutable: unshare!, setprivExecutable: setpriv!, ownerScript,
      args: ["--batch", "--ignore_all_rc_files", "--host_jvm_args=-Xmx512m", "--host_jvm_args=-XX:ActiveProcessorCount=3", `--server_javabase=${javaHome}`, `--output_user_root=${scratch}`, ...BUILD_QUERY_ARGS] }, sink), signal, trace);
  } catch (error) {
    retainScratch = error instanceof BuildQueryCleanupError; throw error;
  } finally { if (!retainScratch) await rm(scratch, { recursive: true, force: true }); }
}

/** The owner requires explicit close after child exit. Drain stdout before publishing bytes. */
export function collectBuildQuery(connect: (sink: CodexTransportSink) => CodexTransport, signal: AbortSignal, trace?: (event: string, value: string) => void): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error("Build query cancelled")); return; }
    let transport: CodexTransport;
    let cleanup: ReturnType<CodexTransport["close"]> | undefined;
    const close = () => cleanup ??= transport.close();
    const chunks: Buffer[] = []; let bytes = 0, failure: Error | undefined, finishing = false, ended = false;
    let exitCode: number | null | undefined;
    const finish = (code?: number | null) => {
      if (finishing) return; finishing = true; clearTimeout(timer); signal.removeEventListener("abort", abort);
      void close().then((evidence) => {
        if (evidence.status !== "confirmed") reject(new BuildQueryCleanupError("Build query owned cleanup is unconfirmed; scratch retained and further queries blocked."));
        else if (failure || code !== 0) reject(failure ?? new Error("Bazel query failed; dependencies or unsupported repository definitions may require setup."));
        else resolve(Buffer.concat(chunks));
      }, () => reject(new BuildQueryCleanupError("Build query cleanup failed; further queries blocked.")));
    };
    const abort = () => { failure = new Error("Build query cancelled"); finish(); };
    const timer = setTimeout(() => { failure = new Error("Bazel query exceeded 30-second deadline"); finish(); }, LIMITS.queryMs);
    const consume = (chunk: Uint8Array, retain: boolean) => {
      trace?.(retain ? "stdout" : "stderr", Buffer.from(chunk).toString("utf8").slice(0, 4096));
      bytes += chunk.byteLength;
      if (bytes > LIMITS.bytes) { failure = new Error("Bazel query exceeded output byte bound"); finish(); }
      else if (retain && !finishing) chunks.push(Buffer.from(chunk));
    };
    try {
      transport = connect({
        stdout: (chunk) => consume(chunk, true), stderr: (chunk) => consume(chunk, false),
        end() { trace?.("end", ""); ended = true; if (exitCode !== undefined) finish(exitCode); },
        exit(code) {
          trace?.("exit", String(code)); exitCode = code;
          // Releasing the control pipe is required before the guardian can emit
          // stdout EOF. Keep consuming late pipe bytes until that EOF arrives.
          void close().catch(() => { failure = new BuildQueryCleanupError("Build query cleanup failed"); finish(); });
          if (ended) finish(code);
        },
        error() { failure = new Error("Owned Bazel query could not start"); finish(); },
      });
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    } catch (error) { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(error); }
  });
}

export class BuildGraphProvider {
  private state: BuildGraphObservation;
  private pending?: Promise<void>;
  private controller = new AbortController();
  private closed = false;
  private checkedAt = 0;
  private failedQuery?: { digest: string; message: string };
  private refreshQueued = false;
  private cleanupBlocked = false;
  constructor(private readonly root: string, repositoryId: string, worldId: string,
    private readonly dependencies = { digest: buildInputDigest, query: queryBuildGraph, now: Date.now }) {
    this.state = { repositoryId, worldId, generation: 0, status: "unavailable", message: "Build graph has not been requested." };
  }
  observe(refresh = false): BuildGraphObservation {
    if (this.closed) throw new Error("Build graph provider disposed");
    if (this.cleanupBlocked) return BuildGraphObservationSchema.parse(this.state);
    if (refresh && this.pending) this.refreshQueued = true;
    if (!this.pending && (refresh || this.dependencies.now() - this.checkedAt >= 1500 || !this.checkedAt)) {
      this.checkedAt = this.dependencies.now();
      // Report the in-flight input sample too, so an event-driven consumer knows
      // to collect its result rather than stopping at the old cached status.
      this.state = { ...this.state, status: "refreshing", message: "Checking repository build inputs." };
      this.pending = this.reconcile(refresh).finally(() => {
        this.pending = undefined;
        this.checkedAt = this.dependencies.now();
        if (this.refreshQueued && !this.closed) { this.refreshQueued = false; this.observe(true); }
      });
    }
    return BuildGraphObservationSchema.parse(this.state);
  }
  private async reconcile(refresh: boolean) {
    const generation = this.state.generation + 1;
    let queryingDigest: string | undefined;
    try {
      const before = await this.dependencies.digest(this.root, this.controller.signal);
      if (this.closed) return;
      if (before === null) { this.state = { ...this.state, status: "unavailable", message: "No registered local WORKSPACE or MODULE.bazel; Bazel graph provider unavailable." }; return; }
      if (!refresh && this.failedQuery?.digest === before) {
        this.state = { ...this.state, status: "error", message: this.failedQuery.message }; return;
      }
      if (!refresh && this.state.graph?.inputDigest === before) {
        this.failedQuery = undefined;
        this.state = { ...this.state, status: "current", message: "Build declarations are current." }; return;
      }
      this.failedQuery = undefined;
      queryingDigest = before;
      this.state = { ...this.state, generation, status: "refreshing", message: "Build inputs changed or Refresh requested; retained graph is not current." };
      const output = await this.dependencies.query(this.root, this.controller.signal);
      const parsed = parseBuildQuery(output);
      // A failed post-query input read is not a failed query of these inputs.
      // Leave passive recovery possible; never publish unvalidated query bytes.
      queryingDigest = undefined;
      const after = await this.dependencies.digest(this.root, this.controller.signal);
      if (this.closed) return;
      if (before !== after) { this.state = { ...this.state, status: "stale", message: "Build inputs changed during the query; checking again." }; return; }
      const graph = BuildGraphDataSchema.parse({ ...parsed, repositoryId: this.state.repositoryId, worldId: this.state.worldId, inputDigest: before, observedAt: new Date(this.dependencies.now()).toISOString(), command: "bazel query --noimplicit_deps --notool_deps //...:*" });
      this.state = { ...this.state, status: "current", graph, message: "Current local declaration observation; not compilation or deployment evidence." };
    } catch (error) {
      if (error instanceof BuildQueryCleanupError) this.cleanupBlocked = true;
      if (!this.closed) {
        const message = (error instanceof Error ? error.message : "Build graph observation failed").slice(0, 512);
        if (queryingDigest) this.failedQuery = { digest: queryingDigest, message };
        this.state = { ...this.state, status: "error", message };
      }
    }
  }
  async dispose(): Promise<void> { this.closed = true; this.controller.abort(); await this.pending; if (this.cleanupBlocked) throw new BuildQueryCleanupError("Build query cleanup remains unconfirmed"); }
}
