// MANUAL, EXPLICITLY AUTHORIZED ONE-TURN PROOF ONLY. Never imported by product.
import { constants } from "node:fs";
import { access, lstat, mkdtemp, open, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, normalize } from "node:path";
import { TrustedLocalSession } from "../../core/agents/trusted-local-session";
import { createOwnedCodexTransport } from "../../core/agents/owner";
import type { CleanupEvidence } from "../../protocol/agents";

const expectedExecutable = "/tmp/swarm-ide-codex-runtime.70xtjj/codex";
const prompt = "Reply Swarm IDE launch verified; do not read or modify files or use tools";
const deadlineMs = 75_000;
const clean = (text: string) => text.replace(/[\p{Cc}\p{Cf}]/gu, (point) =>
  point === "\n" || point === "\t" ? point : `[U+${point.codePointAt(0)!.toString(16).toUpperCase()}]`).slice(0, 4096);
const canonical = (value: string | undefined): value is string => Boolean(value && isAbsolute(value) && normalize(value) === value && !/[\p{Cc}\p{Cf}]/u.test(value));
async function executable(name: string): Promise<string> {
  const candidates = isAbsolute(name) ? [name] : (process.env.PATH ?? "").split(delimiter)
    .filter(isAbsolute).map((directory) => join(directory, name));
  for (const candidate of candidates) {
    try { const actual = await realpath(candidate); await access(actual, constants.X_OK); if ((await stat(actual)).isFile()) return actual; } catch { /* next existing executable */ }
  }
  throw new Error("Required owned-process executable unavailable; no provider was started.");
}
async function main() {
  if (process.env.SWARM_TRUSTED_LIVE_SMOKE !== "1" || process.env.SWARM_TRUSTED_LIVE_CODEX !== expectedExecutable)
    throw new Error("Explicit reviewed one-turn authorization required; no provider was started.");
  const evidence = process.env.SWARM_TRUSTED_LIVE_EVIDENCE;
  if (!canonical(evidence)) throw new Error("Canonical absolute evidence directory required.");
  const evidenceStat = await lstat(evidence);
  if (!evidenceStat.isDirectory() || evidenceStat.isSymbolicLink() || evidenceStat.uid !== process.getuid!() ||
      (evidenceStat.mode & 0o077) !== 0 || await realpath(evidence) !== evidence)
    throw new Error("Evidence must be an existing private, owned, non-symlink directory.");
  const ownerArgument = process.argv[2];
  if (!canonical(ownerArgument)) throw new Error("Bazel-owned process helper required.");
  const ownerScript = await realpath(ownerArgument);
  if (!(await stat(ownerScript)).isFile()) throw new Error("Owned process helper unavailable.");
  const [codex, node, unshare, setpriv] = await Promise.all([expectedExecutable, "node", "unshare", "setpriv"].map(executable));
  // Consume this evidence destination before creating a provider. Never delete
  // this marker, including on failure: unknown delivery must not permit replay.
  const marker = await open(join(evidence, "one-turn-consumed.json"), "wx", 0o600);
  await marker.writeFile(JSON.stringify({ at: new Date().toISOString(), requestedExecutable: expectedExecutable, prompt, maximumTurns: 1 }));
  await marker.close();
  const root = await mkdtemp(join(tmpdir(), "swarm-trusted-live-"));
  let session: TrustedLocalSession | undefined;
  let cleanup: CleanupEvidence | undefined;
  let cleanupPromise: Promise<CleanupEvidence> | undefined;
  let transportStarts = 0;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let resolveOutcome!: (value: string) => void;
  const outcome = new Promise<string>((resolve) => { resolveOutcome = resolve; });
  const finish = (reason: string) => { if (!settled) { settled = true; resolveOutcome(reason); } };
  const signalHandlers = new Map<string, () => void>();
  try {
    if ((await readdir(root)).length !== 0) throw new Error("Disposable workspace was not empty.");
    session = new TrustedLocalSession({ root, executable: codex, openTransport(sink) {
      if (++transportStarts !== 1) throw new Error("A second provider start is forbidden.");
      const transport = createOwnedCodexTransport({ root, executable: codex, nodeExecutable: node,
        unshareExecutable: unshare, setprivExecutable: setpriv, ownerScript,
        args: ["app-server", "--listen", "stdio://"] }, sink);
      return { ...transport, close() {
        cleanupPromise ??= transport.close().then((value) => { cleanup = value; return value; });
        return cleanupPromise;
      } };
    } }, () => {
      const snapshot = session!.snapshot();
      if (snapshot.approvals.length) finish("approval-boundary");
      else if (snapshot.status === "failed") finish("provider-failure");
      else if (snapshot.status === "ready") finish(snapshot.message === "Codex turn completed. You can send another message." ? "completed" : "turn-not-completed");
    });
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
      const handler = () => finish("operator-interrupted");
      signalHandlers.set(signal, handler); process.on(signal, handler);
    }
    deadline = setTimeout(() => finish("deadline"), deadlineMs);
    // Exactly one user turn, inherited model, no read/attachment/config access.
    // No send or decide calls exist in this proof, even when approval is offered.
    const start = session.start(prompt, null).catch(() => finish("provider-failure"));
    const reason = await outcome;
    const beforeStop = session.snapshot();
    await session.stop(); await start;
    clearTimeout(deadline);
    const final = session.snapshot();
    const prefix = `\nYou: ${prompt}\n\n`;
    const answer = beforeStop.output.startsWith(prefix) ? beforeStop.output.slice(prefix.length) : "";
    const ok = reason === "completed" && answer.includes("Swarm IDE launch verified") && final.status === "closed" && cleanup?.status === "confirmed";
    const record = { ok, reason, maximumTurns: 1, providerStarts: transportStarts, attachedFiles: 0,
      modelOverride: null, configurationOverrides: false, approvalAnswered: false,
      snapshot: { status: final.status, output: clean(answer), message: clean(final.message),
        approvalBoundaryObserved: beforeStop.approvals.length > 0 },
      cleanup: cleanup ? { status: cleanup.status, observedAt: cleanup.observedAt, detail: clean(cleanup.detail) } : { status: "unknown" } };
    await writeFile(join(evidence, "live-proof.json"), JSON.stringify(record, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify(record));
    process.exitCode = ok ? 0 : 1;
  } finally {
    clearTimeout(deadline);
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
    await session?.stop();
    // This exact mkdtemp-owned path is the only removal target; auth/config and
    // the consumed evidence marker are neither read nor altered.
    if (transportStarts === 0 || cleanup?.status === "confirmed") await rm(root, { recursive: true, force: true });
  }
}
void main().catch(() => { console.error("Live proof failed before confirmed evidence; do not retry or remove a consumed marker without renewed authorization."); process.exitCode = 1; });
