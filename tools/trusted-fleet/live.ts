// MANUAL THREE-TURN MAXIMUM PROOF. Never imported by the product or auto-tested.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdtemp, open, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, normalize } from "node:path";
import { promisify } from "node:util";
import { RegisteredAgentContextProvider } from "../../core/agents/context";
import { createOwnedCodexTransport } from "../../core/agents/owner";
import { TrustedLocalService } from "../../core/agents/trusted-local";
import { TrustedLocalSession } from "../../core/agents/trusted-local-session";
import { FileTrustedLocalStore } from "../../core/agents/trusted-local-store";
import { computeWorkingWorldFingerprint } from "../../core/fingerprint";
import type { CleanupEvidence } from "../../protocol/agents";
import { PROTOCOL_VERSION } from "../../protocol/common";
import { TrustedRequestSchema, type TrustedRequest, type TrustedSnapshot } from "../../protocol/trusted-local";

const expectedExecutable = "/tmp/swarm-ide-codex-runtime.70xtjj/codex";
const deadlineMs = 120_000;
const phrases = { a: "SWARM_FLEET_ALPHA_READY", b: "SWARM_FLEET_BRAVO_READY", followup: "SWARM_FLEET_BRAVO_FOLLOWUP" };
const instruction = (phrase: string) => `Reply exactly ${phrase}. Do not read or modify files or use tools.`;
const clean = (text: string) => text.replace(/[\p{Cc}\p{Cf}]/gu, (point) =>
  point === "\n" || point === "\t" ? point : `[U+${point.codePointAt(0)!.toString(16).toUpperCase()}]`).slice(0, 4096);
const canonical = (value: string | undefined): value is string => Boolean(value && isAbsolute(value) && normalize(value) === value && !/[\p{Cc}\p{Cf}]/u.test(value));
const execute = promisify(execFile);
class Boundary extends Error {}
function check(value: unknown, reason: string): asserts value { if (!value) throw new Boundary(reason); }
async function executable(name: string): Promise<string> {
  const candidates = isAbsolute(name) ? [name] : (process.env.PATH ?? "").split(delimiter).filter(isAbsolute).map((directory) => join(directory, name));
  for (const candidate of candidates) {
    try { const actual = await realpath(candidate); await access(actual, constants.X_OK); if ((await stat(actual)).isFile()) return actual; } catch { /* next existing candidate */ }
  }
  throw new Boundary("required-owned-process-executable-unavailable");
}
const request = (type: TrustedRequest["type"], fields = {}) => TrustedRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: randomUUID(), type, ...fields });
const answerAfter = (snapshot: TrustedSnapshot, prefix: string) => snapshot.output.startsWith(prefix) ? snapshot.output.slice(prefix.length) : "";

async function main() {
  check(process.env.SWARM_TRUSTED_FLEET_LIVE_SMOKE === "1" && process.env.SWARM_TRUSTED_FLEET_LIVE_CODEX === expectedExecutable,
    "explicit-reviewed-three-turn-authorization-required");
  const evidence = process.env.SWARM_TRUSTED_FLEET_LIVE_EVIDENCE;
  check(canonical(evidence), "canonical-absolute-evidence-directory-required");
  const info = await lstat(evidence);
  check(info.isDirectory() && !info.isSymbolicLink() && info.uid === process.getuid!() && (info.mode & 0o777) === 0o700 && await realpath(evidence) === evidence,
    "existing-private-owned-evidence-directory-required");
  const ownerArgument = process.argv[2]; check(canonical(ownerArgument), "bazel-owned-process-helper-required");
  const ownerScript = await realpath(ownerArgument); check((await stat(ownerScript)).isFile(), "owned-process-helper-unavailable");
  const [codex, node, unshare, setpriv, git] = await Promise.all([expectedExecutable, "node", "unshare", "setpriv", "git"].map(executable));
  // This is consumed before any provider, even when execution later fails.
  const marker = await open(join(evidence, "three-turn-consumed.json"), "wx", 0o600);
  try { await marker.writeFile(JSON.stringify({ at: new Date().toISOString(), requestedExecutable: expectedExecutable, maximumTurns: 3, maximumConversations: 2, phrases })); await marker.sync(); }
  finally { await marker.close(); }

  const root = await mkdtemp(join(tmpdir(), "swarm-trusted-fleet-live-"));
  const storePath = join(evidence, "history.json");
  let service: TrustedLocalService | undefined, restored: TrustedLocalService | undefined;
  const sessions: TrustedLocalSession[] = [];
  const cleanups = new Map<number, CleanupEvidence>();
  const closes = new Map<number, Promise<CleanupEvidence>>();
  const listeners = new Set<() => void>();
  const signalHandlers = new Map<string, () => void>();
  let providerStarts = 0, turnStarts = 0, replayAttempts = 0, stopping = false;
  let abortReason: string | undefined;
  let rejectAborted!: (error: Boundary) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAborted = reject; });
  void aborted.catch(() => {});
  const abort = (reason: string) => { if (!abortReason) { abortReason = reason; rejectAborted(new Boundary(reason)); for (const listener of listeners) listener(); } };
  const guard = () => { if (abortReason) throw new Boundary(abortReason); };
  const within = <T>(operation: Promise<T>) => Promise.race([operation, aborted]);
  let stage = "workspace-setup", reason = "proof-failure", ok = false, workspaceRemoved = false;
  let tokenA: string | undefined, tokenB: string | undefined;
  const proof: Record<string, unknown> = {};
  const deadline = setTimeout(() => abort("deadline"), deadlineMs);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    const handler = () => abort("operator-interrupted"); signalHandlers.set(signal, handler); process.on(signal, handler);
  }
  const observedChange = () => {
    if (!stopping) {
      if (sessions.some((session) => session.snapshot().approvals.length > 0)) abort("approval-boundary");
      else if (sessions.some((session) => session.snapshot().status === "failed")) abort("provider-failure");
    }
    for (const listener of listeners) listener();
  };
  const waitFor = (condition: () => boolean): Promise<void> => within(new Promise<void>((resolve, reject) => {
    const inspect = () => {
      try { guard(); if (condition()) { listeners.delete(inspect); resolve(); } }
      catch (cause) { listeners.delete(inspect); reject(cause); }
    };
    listeners.add(inspect); inspect();
  }));
  try {
    check((await readdir(root)).length === 0, "disposable-workspace-not-empty");
    await within(execute(git, ["init", "-q"], { cwd: root, timeout: 5000, maxBuffer: 8192 })); guard();
    // Identity and disabled commit hooks/signing apply only to this disposable
    // setup command; no user or repository config file is changed.
    await within(execute(git, ["-c", "user.name=Swarm Fleet Proof", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-qm", "Empty owned proof workspace"],
      { cwd: root, timeout: 5000, maxBuffer: 8192 })); guard();
    check((await readdir(root)).every((name) => name === ".git"), "disposable-workspace-has-source-files");
    const revision = await within(computeWorkingWorldFingerprint(root)); guard();
    const createContext = () => RegisteredAgentContextProvider.create({ root, repositoryId: "repository:trusted-fleet-proof", worldId: "world:working",
      workingRevision: () => revision, resolveFocus: async () => [{ attachmentPath: null, sourcePaths: [] }], provenance: async () => ({ instructions: [], configuration: [] }) });
    const context = await within(createContext()); guard();
    service = new TrustedLocalService({ root, context, store: new FileTrustedLocalStore(storePath), createSession: async (onChange) => {
      guard(); check(sessions.length < 2, "third-provider-session-forbidden");
      const index = sessions.length;
      const session = new TrustedLocalSession({ root, executable: codex, openTransport(sink) {
        guard(); check(++providerStarts <= 2, "third-provider-start-forbidden");
        const transport = createOwnedCodexTransport({ root, executable: codex, nodeExecutable: node, unshareExecutable: unshare,
          setprivExecutable: setpriv, ownerScript, args: ["app-server", "--listen", "stdio://"] }, sink);
        return { write(line) {
          const message = JSON.parse(line);
          if (message.method === "turn/start") { guard(); check(++turnStarts <= 3, "fourth-product-turn-forbidden"); }
          transport.write(line);
        }, close() {
          let pending = closes.get(index);
          if (!pending) { pending = transport.close().then((value) => { cleanups.set(index, value); return value; }); closes.set(index, pending); }
          return pending;
        } };
      } }, () => { onChange(); observedChange(); });
      sessions.push(session); return session;
    } });
    const prepareLaunch = async (phrase: string) => {
      guard(); const prepared = await within(service!.request(request("trusted.prepare", { input: { worldId: "world:working",
        focus: { worldId: "world:working", revisionKind: "working", revisionId: revision, domain: "repo", key: "directory:." },
        taskText: instruction(phrase), model: null, effort: null, links: { parentRunId: null, task: null, spec: null } } }))); guard();
      check(prepared.preparation, "preparation-missing");
      const { token, prompt } = prepared.preparation;
      const materialized = JSON.parse(prompt);
      check(materialized.attachments.length === 0 && materialized.workspace === root, "unexpected-materialized-context");
      const launched = await within(service!.request(request("trusted.launch", { token }))); guard();
      check(launched.runToken === token, "launch-target-mismatch"); return { token, prompt };
    };
    stage = "two-initial-conversations";
    const a = await prepareLaunch(phrases.a); tokenA = a.token;
    const b = await prepareLaunch(phrases.b); tokenB = b.token;
    check(a.token !== b.token, "duplicate-run-token");
    await waitFor(() => [a.token, b.token].every((token) => service!.snapshot(token).status === "ready")); guard();
    const initialA = await within(service.request(request("trusted.snapshot", { token: a.token })));
    const initialB = await within(service.request(request("trusted.snapshot", { token: b.token })));
    const answerA = answerAfter(initialA, `\nYou: ${a.prompt}\n\n`), answerB = answerAfter(initialB, `\nYou: ${b.prompt}\n\n`);
    check(initialA.runToken === a.token && initialB.runToken === b.token && initialA.threadId && initialB.threadId && initialA.threadId !== initialB.threadId,
      "initial-conversation-identity-mismatch");
    check(answerA.trim() === phrases.a && answerB.trim() === phrases.b, "initial-provider-answer-mismatch");
    proof.initial = { a: { token: a.token, threadId: initialA.threadId, output: clean(answerA) }, b: { token: b.token, threadId: initialB.threadId, output: clean(answerB) } };

    stage = "stop-a-preserves-b"; guard();
    const closedA = await within(service.request(request("trusted.stop", { token: a.token })));
    const retainedB = await within(service.request(request("trusted.snapshot", { token: b.token })));
    check(closedA.runToken === a.token && closedA.status === "closed" && cleanups.get(0)?.status === "confirmed", "a-cleanup-unconfirmed");
    check(retainedB.runToken === b.token && retainedB.status === "ready" && retainedB.threadId === initialB.threadId && retainedB.output === initialB.output && !cleanups.has(1), "stopping-a-disturbed-b");
    proof.stopA = { status: closedA.status, bStatus: retainedB.status, bOutputUnchanged: true, cleanup: cleanups.get(0)?.status };

    stage = "followup-only-to-b"; guard();
    const followup = instruction(phrases.followup);
    const sent = await within(service.request(request("trusted.send", { token: b.token, text: followup, expectedTurnId: null })));
    check(sent.runToken === b.token, "followup-ack-target-mismatch");
    await waitFor(() => service!.snapshot(b.token).status === "ready"); guard();
    const followedB = await within(service.request(request("trusted.snapshot", { token: b.token })));
    const unchangedA = await within(service.request(request("trusted.snapshot", { token: a.token })));
    const followupAnswer = answerAfter(followedB, `${initialB.output}\nYou: ${followup}\n\n`);
    check(followedB.threadId === initialB.threadId && followedB.turnId !== initialB.turnId && followupAnswer.trim() === phrases.followup, "followup-provider-answer-mismatch");
    check(unchangedA.status === "closed" && unchangedA.output === closedA.output && !unchangedA.output.includes(phrases.followup), "followup-mutated-a");
    proof.followup = { token: b.token, sameThread: true, newTurn: true, output: clean(followupAnswer), aUnchanged: true, expectedTurnId: null };

    stage = "close-and-reopen-history"; guard();
    const closedB = await within(service.request(request("trusted.stop", { token: b.token })));
    check(closedB.status === "closed" && cleanups.get(1)?.status === "confirmed", "b-cleanup-unconfirmed");
    await within(service.shutdown()); guard();
    restored = new TrustedLocalService({ root, context: await within(createContext()), store: new FileTrustedLocalStore(storePath),
      createSession: async () => { replayAttempts++; throw new Boundary("history-created-provider-session"); } });
    const historicalA = await within(restored.request(request("trusted.snapshot", { token: a.token })));
    const historicalB = await within(restored.request(request("trusted.snapshot", { token: b.token })));
    check(historicalA.archived && historicalB.archived && historicalA.output === closedA.output && historicalB.output === closedB.output &&
      historicalA.status === "closed" && historicalB.status === "closed" && replayAttempts === 0, "archived-history-mismatch-or-replay");
    check(providerStarts === 2 && turnStarts === 3, "unexpected-provider-or-turn-count");
    check((await readdir(root)).every((name) => name === ".git"), "provider-created-unexpected-workspace-file");
    proof.history = { records: historicalB.runs?.length, aArchived: true, bArchived: true, outputsRetained: true, replayAttempts };
    reason = "completed"; ok = true;
  } catch (cause) { reason = cause instanceof Boundary ? cause.message : "proof-failure"; }
  finally {
    stopping = true; clearTimeout(deadline); listeners.clear();
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
    // Stop every owned session independently of service persistence. The
    // guardian observes this process's death if even evidence I/O stalls; never
    // signal a saved PID or delete the workspace on an unconfirmed boundary.
    const hardCleanupDeadline = setTimeout(() => {
      console.error("Fleet proof cleanup/evidence exceeded 15s; outcome unknown, owned guardian fallback retained. No retry.");
      process.exit(1);
    }, 15_000);
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    const cleanupFinished = await Promise.race([
      Promise.allSettled([service?.shutdown(), restored?.shutdown(), ...sessions.map((session) => session.stop())])
        .then(() => Promise.allSettled([...closes.values()])).then(() => true),
      new Promise<false>((resolve) => { cleanupTimer = setTimeout(() => resolve(false), 10_000); }),
    ]);
    clearTimeout(cleanupTimer);
    const cleanupComplete = providerStarts === 0 || (cleanups.size === providerStarts && [...cleanups.values()].every((value) => value.status === "confirmed"));
    if (cleanupFinished && cleanupComplete) { await rm(root, { recursive: true, force: true }); workspaceRemoved = true; }
    if (!cleanupFinished) reason = "cleanup-deadline";
    ok = ok && cleanupFinished && cleanupComplete;
    const record = { ok, reason, stage, maximumTurns: 3, maximumConversations: 2, providerStarts, turnStarts, replayAttempts,
      attachedFiles: 0, modelOverride: null, providerConfigurationOverrides: false, approvalAnswered: false,
      noToolsRequested: true, absenceOfReadOnlyToolsAttested: false, deadlineMs, cleanupGraceMs: 15_000,
      tokens: { a: tokenA ?? null, b: tokenB ?? null }, proof,
      cleanup: [...cleanups.entries()].map(([index, value]) => ({ index, status: value.status, observedAt: value.observedAt, detail: clean(value.detail) })),
      cleanupComplete, cleanupFinished, workspaceRemoved };
    await writeFile(join(evidence, "live-proof.json"), JSON.stringify(record, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify(record)); clearTimeout(hardCleanupDeadline); process.exitCode = ok ? 0 : 1;
    if (!cleanupFinished || !cleanupComplete) process.exit(1);
  }
}
void main().catch(() => { console.error("Fleet live proof stopped before complete evidence; never remove a consumed marker or retry without renewed authorization."); process.exitCode = 1; });
