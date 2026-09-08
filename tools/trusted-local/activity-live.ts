// MANUAL one-turn provider-activity proof; never imported by the product/tests.
import { constants } from "node:fs";
import { access, lstat, mkdtemp, open, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { TrustedLocalSession } from "../../core/agents/trusted-local-session";
import { createOwnedCodexTransport } from "../../core/agents/owner";
import type { CleanupEvidence } from "../../protocol/agents";

const codex = "/tmp/swarm-ide-codex-runtime.70xtjj/codex";
const prompt = "This is a disposable empty Git repository. Only here, run a shell command to print the current directory, then use apply_patch to create activity-proof.txt containing exactly hello followed by a newline. Reply A2 activity verified. Do not read other files, inspect configuration or credentials, access the network, or modify anything outside this directory.";
async function executable(name: string): Promise<string> {
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(isAbsolute)) {
    try { const path = await realpath(join(directory, name)); await access(path, constants.X_OK); if ((await stat(path)).isFile()) return path; } catch { /* next */ }
  }
  throw new Error("Required owned-process executable unavailable");
}
async function main(): Promise<void> {
  if (process.env.SWARM_ACTIVITY_LIVE !== "1") throw new Error("Explicit one-turn authority required");
  const evidence = process.env.SWARM_ACTIVITY_EVIDENCE;
  if (!evidence || !isAbsolute(evidence) || await realpath(evidence) !== evidence) throw new Error("Owned evidence path required");
  const info = await lstat(evidence);
  if (!info.isDirectory() || info.uid !== process.getuid!() || (info.mode & 0o077)) throw new Error("Private owned evidence required");
  const ownerScript = await realpath(process.argv[2]!);
  const [node, unshare, setpriv, git] = await Promise.all(["node", "unshare", "setpriv", "git"].map(executable));
  const marker = await open(join(evidence, "one-turn-consumed.json"), "wx", 0o600);
  await marker.writeFile(JSON.stringify({ maximumTurns: 1, at: new Date().toISOString(), prompt })); await marker.close();
  const root = await mkdtemp(join(tmpdir(), "swarm-activity-live-"));
  let session: TrustedLocalSession | undefined, cleanup: CleanupEvidence | undefined;
  let cleanupPromise: Promise<CleanupEvidence> | undefined;
  let starts = 0, turns = 0, settled = false;
  let finish!: (reason: string) => void;
  const outcome = new Promise<string>((resolve) => { finish = (reason) => { if (!settled) { settled = true; resolve(reason); } }; });
  const timer = setTimeout(() => finish("deadline"), 100_000);
  const interrupted = () => finish("operator-interrupted");
  process.on("SIGTERM", interrupted); process.on("SIGINT", interrupted);
  try {
    execFileSync(git, ["-c", "init.templateDir=", "init", "--quiet", root], { stdio: "ignore", timeout: 5000 });
    session = new TrustedLocalSession({ root, executable: codex, openTransport(sink) {
      if (++starts !== 1) throw new Error("No second provider start");
      const transport = createOwnedCodexTransport({ root, executable: codex, nodeExecutable: node,
        unshareExecutable: unshare, setprivExecutable: setpriv, ownerScript, args: ["app-server", "--listen", "stdio://"] }, sink);
      return { write(line) {
        if (JSON.parse(line).method === "turn/start" && ++turns !== 1) throw new Error("No second model turn");
        transport.write(line);
      }, close() { return cleanupPromise ??= transport.close().then((value) => { cleanup = value; return value; }); } };
    } }, () => {
      const state = session!.snapshot();
      if (state.approvals.length) finish("approval-boundary");
      else if (state.status === "failed") finish("provider-failure");
      else if (state.status === "ready") finish("turn-ended");
    });
    const start = session.start(prompt, "gpt-6-astra").catch(() => finish("provider-failure"));
    const reason = await outcome;
    const beforeStop = session.snapshot(), activities = session.activity();
    await session.stop(); await start;
    const fileCorrect = await readFile(join(root, "activity-proof.txt"), "utf8").then((text) => text === "hello\n", () => false);
    const kinds = ["command", "fileChange", "turn"].every((kind) => activities.some((entry) => entry.kind === kind && entry.status === "completed"));
    const ok = reason === "turn-ended" && kinds && fileCorrect && turns === 1 && cleanup?.status === "confirmed" && session.snapshot().status === "closed";
    const record = { ok, reason, maximumTurns: 1, providerStarts: starts, actualTurnRequests: turns, model: "gpt-6-astra",
      inheritedConfiguration: true, approvalAnswered: false, fileCorrect, sessionStatus: session.snapshot().status,
      beforeStopStatus: beforeStop.status, activities, cleanupStatus: cleanup?.status ?? "unknown" };
    await writeFile(join(evidence, "activity-live.json"), JSON.stringify(record, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify(record)); process.exitCode = ok ? 0 : 1;
  } finally {
    clearTimeout(timer); process.removeListener("SIGTERM", interrupted); process.removeListener("SIGINT", interrupted);
    await session?.stop();
    if (starts === 0 || cleanup?.status === "confirmed") await rm(root, { recursive: true, force: true });
  }
}
void main().catch(() => { console.error("Activity live proof stopped; preserve consumed marker, no automatic retry."); process.exitCode = 1; });
