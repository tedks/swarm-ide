// MANUAL THREE-TURN MAXIMUM PROOF. Never imported by the product or auto-tested.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdtemp, open, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, normalize } from "node:path";
import { promisify } from "node:util";
import { RegisteredAgentContextProvider } from "../../core/agents/context";
import { ProviderJsonl } from "../../core/agents/jsonl";
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
const clean = (text: string) => text.replace(/[\p{Cc}\p{Cf}]/gu, (point) =>
  point === "\n" || point === "\t" ? point : `[U+${point.codePointAt(0)!.toString(16).toUpperCase()}]`).slice(0, 4096);
const canonical = (value: string | undefined): value is string => Boolean(value && isAbsolute(value) && normalize(value) === value && !/[\p{Cc}\p{Cf}]/u.test(value));
const execute = promisify(execFile);
class Boundary extends Error {}
function check(value: unknown, reason: string): asserts value { if (!value) throw new Boundary(reason); }
const object = (value: unknown): Record<string, unknown> => {
  check(value && typeof value === "object" && !Array.isArray(value), "invalid-provider-metadata");
  return value as Record<string, unknown>;
};
const identity = (value: unknown): string => {
  check(typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\p{White_Space}\p{Cc}\p{Cf}]/u.test(value), "invalid-provider-identity");
  return value;
};
async function executable(name: string): Promise<string> {
  const candidates = isAbsolute(name) ? [name] : (process.env.PATH ?? "").split(delimiter).filter(isAbsolute).map((directory) => join(directory, name));
  for (const candidate of candidates) {
    try { const actual = await realpath(candidate); await access(actual, constants.X_OK); if ((await stat(actual)).isFile()) return actual; } catch { /* next existing candidate */ }
  }
  throw new Boundary("required-owned-process-executable-unavailable");
}
const request = (type: TrustedRequest["type"], fields = {}) => TrustedRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: randomUUID(), type, ...fields });
const answerAfter = (snapshot: TrustedSnapshot, prefix: string) => snapshot.output.startsWith(prefix) ? snapshot.output.slice(prefix.length) : "";
type NativeConversation = {
  owner: number; method: "thread/start" | "thread/fork"; parameterNames: string[];
  requestedParentThreadId: string | null; requestedParentTurnId: string | null;
  requestCwd: string; responseCwd?: string; threadCwd?: string; threadId?: string; forkedFromId?: string | null;
};
type NativeTurn = { owner: number; threadId: string; turnId?: string };
type NativeGoalOperation = {
  owner: number; method: "thread/goal/clear" | "thread/goal/get"; threadId: string; cleared?: boolean; goalIsNull?: boolean;
};

async function main() {
  check(process.env.SWARM_TRUSTED_FORK_LIVE_SMOKE === "1" && process.env.SWARM_TRUSTED_FORK_LIVE_CODEX === expectedExecutable,
    "explicit-reviewed-three-turn-authorization-required");
  const evidence = process.env.SWARM_TRUSTED_FORK_LIVE_EVIDENCE;
  check(canonical(evidence), "canonical-absolute-evidence-directory-required");
  const info = await lstat(evidence);
  check(info.isDirectory() && !info.isSymbolicLink() && info.uid === process.getuid!() && (info.mode & 0o777) === 0o700 && await realpath(evidence) === evidence,
    "existing-private-owned-evidence-directory-required");
  const ownerArgument = process.argv[2]; check(canonical(ownerArgument), "bazel-owned-process-helper-required");
  const ownerScript = await realpath(ownerArgument); check((await stat(ownerScript)).isFile(), "owned-process-helper-unavailable");
  const [codex, node, unshare, setpriv, git] = await Promise.all([expectedExecutable, "node", "unshare", "setpriv", "git"].map(executable));
  const sentinel = `SWARM_FORK_MEMORY_${randomUUID()}`;
  const followupPhrase = `SWARM_FORK_PARENT_ALIVE_${randomUUID()}`;
  const parentText = `Remember this benign sentinel for this conversation: ${sentinel}. Reply exactly REMEMBERED. Do not read or modify files, use tools, or start other agents.`;
  // The child's input deliberately contains neither the sentinel nor a copy of
  // the parent's prompt. Recall must come from the provider's native history.
  const childText = "Recall the benign sentinel that the parent was asked to remember in the inherited conversation. Reply with only that exact sentinel. Do not read or modify files, use tools, or start other agents.";
  check(!childText.includes(sentinel), "child-instruction-leaks-sentinel");
  // Consume once before any provider starts, including runs that later fail.
  const marker = await open(join(evidence, "three-turn-consumed.json"), "wx", 0o600);
  try {
    await marker.writeFile(JSON.stringify({ at: new Date().toISOString(), requestedExecutable: expectedExecutable,
      maximumTurns: 3, maximumConversations: 2, parentText, childText, followupPhrase }));
    await marker.sync();
  } finally { await marker.close(); }

  const root = await mkdtemp(join(tmpdir(), "swarm-trusted-fork-live-"));
  const storePath = join(evidence, "history.json");
  let service: TrustedLocalService | undefined, restored: TrustedLocalService | undefined;
  const sessions: TrustedLocalSession[] = [];
  const cleanups = new Map<number, CleanupEvidence>();
  const closes = new Map<number, Promise<CleanupEvidence>>();
  const conversations: NativeConversation[] = [], turns: NativeTurn[] = [], goalOperations: NativeGoalOperation[] = [];
  const startedTurns: Array<{ owner: number; threadId: string; id: string }> = [];
  const turnPrompts = new Map<number, string[]>();
  const listeners = new Set<() => void>();
  const signalHandlers = new Map<string, () => void>();
  let providerStarts = 0, threadStarts = 0, forkStarts = 0, turnStarts = 0, goalClears = 0, goalGets = 0, replayAttempts = 0, stopping = false;
  let observedToolActivity = false, abortReason: string | undefined;
  let rejectAborted!: (error: Boundary) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAborted = reject; });
  void aborted.catch(() => {});
  const abort = (reason: string) => { if (!abortReason) { abortReason = reason; rejectAborted(new Boundary(reason)); for (const listener of listeners) listener(); } };
  const guard = () => { if (abortReason) throw new Boundary(abortReason); };
  const within = <T>(operation: Promise<T>) => Promise.race([operation, aborted]);
  let stage = "workspace-setup", reason = "proof-failure", ok = false, workspaceRemoved = false;
  let parentToken: string | undefined, childToken: string | undefined;
  const proof: Record<string, unknown> = {};
  const deadline = setTimeout(() => abort("deadline"), deadlineMs);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    const handler = () => abort("operator-interrupted"); signalHandlers.set(signal, handler); process.on(signal, handler);
  }
  const observedChange = () => {
    if (!stopping) {
      observedToolActivity ||= sessions.some((session) => session.activity().some((entry) => entry.kind !== "turn"));
      if (sessions.some((session) => session.snapshot().approvals.length > 0)) abort("approval-boundary");
      else if (observedToolActivity) abort("unexpected-provider-tool-activity");
      else if (sessions.some((session) => session.snapshot().status === "failed")) abort("provider-failure");
    }
    for (const listener of listeners) listener();
  };
  const waitFor = async (condition: () => boolean): Promise<void> => {
    let inspect!: () => void;
    const ready = new Promise<void>((resolve, reject) => {
      inspect = () => {
        try { guard(); if (condition()) resolve(); }
        catch (cause) { reject(cause); }
      };
      listeners.add(inspect); inspect();
    });
    // Completion can precede turn/start acknowledgement. That acknowledgement's
    // final busy=false is intentionally not a provider event, so recheck only
    // this owned snapshot on a bounded proof timer, not model/supervisor polling.
    const timer = setInterval(inspect, 25);
    try { await within(ready); }
    finally { clearInterval(timer); listeners.delete(inspect); }
  };
  try {
    const rootInfo = await lstat(root);
    check(rootInfo.isDirectory() && rootInfo.uid === process.getuid!() && (rootInfo.mode & 0o777) === 0o700 && await realpath(root) === root,
      "disposable-workspace-not-private-owned-canonical");
    check((await readdir(root)).length === 0, "disposable-workspace-not-empty");
    await within(execute(git!, ["init", "-q"], { cwd: root, timeout: 5000, maxBuffer: 8192 })); guard();
    // These flags apply only to this empty setup commit, never provider config.
    await within(execute(git!, ["-c", "user.name=Swarm Fork Proof", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-qm", "Empty owned fork proof workspace"],
      { cwd: root, timeout: 5000, maxBuffer: 8192 })); guard();
    check((await readdir(root)).every((name) => name === ".git"), "disposable-workspace-has-source-files");
    const revision = await within(computeWorkingWorldFingerprint(root)); guard();
    const createContext = () => RegisteredAgentContextProvider.create({ root, repositoryId: "repository:trusted-fork-proof", worldId: "world:working",
      workingRevision: () => revision, resolveFocus: async () => [{ attachmentPath: null, sourcePaths: [] }], provenance: async () => ({ instructions: [], configuration: [] }) });
    const context = await within(createContext()); guard();
    service = new TrustedLocalService({ root, context, store: new FileTrustedLocalStore(storePath), createSession: async (onChange) => {
      guard(); check(sessions.length < 2, "third-provider-session-forbidden");
      const index = sessions.length;
      const session = new TrustedLocalSession({ root, executable: codex!, openTransport(sink) {
        guard(); check(++providerStarts <= 2, "third-provider-start-forbidden");
        const framer = new ProviderJsonl();
        const pending = new Map<number, NativeConversation | NativeTurn | NativeGoalOperation>();
        // Observe only responses to our own thread/turn requests. Never retain
        // raw provider objects, diagnostics, configuration, or credentials.
        const observe = (value: unknown) => {
          if (abortReason) return;
          const message = object(value);
          if (message.method === "turn/started") {
            const params = object(message.params), threadId = identity(params.threadId), id = identity(object(params.turn).id);
            check(threadId === conversations[index]?.threadId, "provider-started-turn-on-unexpected-thread");
            if (!startedTurns.some((turn) => turn.owner === index && turn.threadId === threadId && turn.id === id)) {
              startedTurns.push({ owner: index, threadId, id });
              check(startedTurns.length <= 3, "fourth-observed-provider-turn-forbidden");
              check(startedTurns.filter((turn) => turn.owner === index).length <= turns.filter((turn) => turn.owner === index).length,
                "unsolicited-provider-turn-start");
            }
            if (index === 1) check(typeof goalOperations[0]?.cleared === "boolean" && goalOperations[1]?.goalIsNull === true,
              "child-started-turn-before-acknowledged-absent-goal");
            return;
          }
          const entry = typeof message.id === "number" ? pending.get(message.id) : undefined;
          if (!entry) return;
          pending.delete(message.id as number);
          if (message.error) return; // The product session reports this failure.
          const result = object(message.result);
          if ("requestedParentThreadId" in entry) {
            const thread = object(result.thread);
            check(result.cwd === root && thread.cwd === root, "native-response-workspace-mismatch");
            entry.responseCwd = root; entry.threadCwd = root; entry.threadId = identity(thread.id);
            entry.forkedFromId = thread.forkedFromId == null ? null : identity(thread.forkedFromId);
          } else if ("method" in entry) {
            if (entry.method === "thread/goal/clear") {
              check(typeof result.cleared === "boolean", "invalid-child-goal-clear-acknowledgement");
              entry.cleared = result.cleared;
            } else {
              entry.goalIsNull = result.goal === null;
              check(entry.goalIsNull, "child-retained-inherited-goal");
            }
          } else entry.turnId = identity(object(result.turn).id);
        };
        const transport = createOwnedCodexTransport({ root, executable: codex!, nodeExecutable: node!, unshareExecutable: unshare!,
          setprivExecutable: setpriv!, ownerScript, args: ["app-server", "--listen", "stdio://"] }, { ...sink,
          stdout(chunk) {
            try { framer.push(chunk, observe); } catch (cause) { abort(cause instanceof Boundary ? cause.message : "invalid-native-metadata"); }
            sink.stdout(chunk);
          },
        });
        return { write(line) {
          const message = object(JSON.parse(line));
          if (message.method === "thread/start" || message.method === "thread/fork") {
            guard(); check(threadStarts + forkStarts < 2, "third-provider-conversation-forbidden");
            const params = object(message.params), fork = message.method === "thread/fork";
            check(params.cwd === root, "native-request-workspace-mismatch");
            const parameterNames = Object.keys(params).sort();
            check(JSON.stringify(parameterNames) === JSON.stringify(fork
              ? ["cwd", "deferGoalContinuation", "ephemeral", "excludeTurns", "lastTurnId", "threadId"] : ["cwd"]), "unexpected-provider-configuration-override");
            check(fork ? index === 1 && threadStarts === 1 && forkStarts === 0 : index === 0 && threadStarts === 0 && forkStarts === 0,
              "unexpected-provider-conversation-order");
            if (fork) check(params.excludeTurns === true && params.deferGoalContinuation === true && params.ephemeral === false, "native-fork-history-contract-mismatch");
            const entry: NativeConversation = { owner: index, method: message.method, parameterNames, requestCwd: root,
              requestedParentThreadId: fork ? identity(params.threadId) : null, requestedParentTurnId: fork ? identity(params.lastTurnId) : null };
            check(typeof message.id === "number", "native-request-id-missing");
            conversations.push(entry); pending.set(message.id, entry);
            if (fork) forkStarts++; else threadStarts++;
          } else if (message.method === "thread/goal/clear" || message.method === "thread/goal/get") {
            guard();
            const params = object(message.params), child = conversations[1];
            check(index === 1 && child?.method === "thread/fork" && child.threadId && child.threadId !== conversations[0]?.threadId &&
              child.forkedFromId === conversations[0]?.threadId && params.threadId === child.threadId &&
              JSON.stringify(Object.keys(params)) === JSON.stringify(["threadId"]), "goal-operation-not-exact-confirmed-child");
            check(!turnPrompts.has(1), "goal-operation-after-child-turn");
            if (message.method === "thread/goal/clear") {
              check(goalClears === 0 && goalGets === 0, "duplicate-or-out-of-order-child-goal-clear"); goalClears++;
            } else {
              check(goalClears === 1 && goalGets === 0 && typeof goalOperations[0]?.cleared === "boolean", "child-goal-get-before-clear-acknowledgement"); goalGets++;
            }
            check(typeof message.id === "number", "native-request-id-missing");
            const entry: NativeGoalOperation = { owner: index, method: message.method, threadId: child.threadId };
            goalOperations.push(entry); pending.set(message.id, entry);
          } else if (message.method === "turn/start") {
            guard(); check(turnStarts < 3, "fourth-product-turn-forbidden");
            const params = object(message.params);
            check(JSON.stringify(Object.keys(params).sort()) === JSON.stringify(["input", "threadId"]), "unexpected-turn-configuration-override");
            check(Array.isArray(params.input) && params.input.length === 1, "unexpected-provider-turn-input");
            const input = object(params.input[0]); check(input.type === "text" && typeof input.text === "string", "unexpected-provider-turn-text");
            if (index === 1) {
              check(!input.text.includes(sentinel), "child-wire-input-leaks-sentinel");
              check(goalClears === 1 && goalGets === 1 && typeof goalOperations[0]?.cleared === "boolean" && goalOperations[1]?.goalIsNull === true,
                "child-turn-before-acknowledged-absent-goal");
            }
            const prompts = turnPrompts.get(index) ?? []; prompts.push(input.text); turnPrompts.set(index, prompts);
            const entry: NativeTurn = { owner: index, threadId: identity(params.threadId) };
            check(typeof message.id === "number", "native-request-id-missing");
            turns.push(entry); pending.set(message.id, entry); turnStarts++;
          } else check(message.method === "initialize" || message.method === "initialized" || message.method === "turn/interrupt", "unexpected-provider-request");
          transport.write(line);
        }, close() {
          let pending = closes.get(index);
          if (!pending) { pending = transport.close().then((value) => { cleanups.set(index, value); return value; }); closes.set(index, pending); }
          return pending;
        } };
      } }, () => { onChange(); observedChange(); });
      sessions.push(session); return session;
    } });

    stage = "parent-initial-turn";
    const prepared = await within(service.request(request("trusted.prepare", { input: { worldId: "world:working",
      focus: { worldId: "world:working", revisionKind: "working", revisionId: revision, domain: "repo", key: "directory:." },
      taskText: parentText, model: null, effort: null, links: { parentRunId: null, task: null, spec: null } } }))); guard();
    check(prepared.preparation, "parent-preparation-missing");
    const { token, prompt } = prepared.preparation; parentToken = token;
    const materialized = JSON.parse(prompt);
    check(materialized.attachments.length === 0 && materialized.workspace === root && materialized.instructions === parentText, "unexpected-materialized-context");
    const launched = await within(service.request(request("trusted.launch", { token }))); guard();
    check(launched.runToken === token, "parent-launch-target-mismatch");
    await waitFor(() => Boolean(service!.snapshot(token).forkPoint)); guard();
    const parent = await within(service.request(request("trusted.snapshot", { token })));
    const point = parent.forkPoint;
    check(parent.status === "ready" && point && point.threadId === parent.threadId && point.turnId === parent.turnId, "parent-completed-fork-point-missing");
    const parentAnswer = answerAfter(parent, `\nYou: ${prompt}\n\n`);
    check(parentAnswer.trim() === "REMEMBERED" && Number(turnStarts) === 1 && turnPrompts.get(0)?.[0] === prompt, "parent-provider-answer-mismatch");
    proof.parent = { token, instanceId: parent.instanceId, forkPoint: point, output: clean(parentAnswer) };

    stage = "native-child-fork-and-recall";
    childToken = randomUUID();
    const forked = await within(service.request(request("trusted.fork", { token, childToken, expectedInstanceId: parent.instanceId,
      expectedThreadId: point.threadId, expectedTurnId: point.turnId, text: childText, model: null }))); guard();
    check(forked.runToken === childToken && childToken !== token, "child-fork-target-mismatch");
    await waitFor(() => Boolean(service!.snapshot(childToken!).forkPoint)); guard();
    const child = await within(service.request(request("trusted.snapshot", { token: childToken })));
    const childPrompt = turnPrompts.get(1)?.[0];
    check(childPrompt && !childPrompt.includes(sentinel) && JSON.parse(childPrompt).instructions === childText, "child-wire-input-context-mismatch");
    const childAnswer = answerAfter(child, `\nYou: ${childPrompt}\n\n`);
    const lineage = child.runs?.find((run) => run.runToken === childToken)?.fork;
    check(child.status === "ready" && child.threadId && child.threadId !== parent.threadId && childAnswer.trim() === sentinel, "child-native-recall-or-identity-mismatch");
    check(lineage?.confirmed && lineage.parentRunToken === token && lineage.parentThreadId === point.threadId && lineage.parentTurnId === point.turnId &&
      lineage.sharedWorkspace && lineage.inheritedTaskReference === null && child.taskReference === null, "child-lineage-mismatch");
    check(providerStarts === 2 && sessions.length === 2 && threadStarts === 1 && forkStarts === 1 && Number(turnStarts) === 2 && cleanups.size === 0,
      "two-independent-live-owners-not-confirmed");
    check(child.workspace === root && parent.workspace === root && goalClears === 1 && goalGets === 1 && goalOperations.length === 2 &&
      goalOperations.every((operation) => operation.owner === 1 && operation.threadId === child.threadId) && goalOperations[1]?.goalIsNull === true,
      "child-workspace-or-inherited-goal-boundary-mismatch");
    const nativeParent = conversations[0], nativeChild = conversations[1];
    check(nativeParent?.threadId === parent.threadId && nativeParent.forkedFromId === null && nativeChild?.threadId === child.threadId &&
      nativeChild.forkedFromId === parent.threadId && nativeChild.requestedParentThreadId === point.threadId && nativeChild.requestedParentTurnId === point.turnId,
      "native-provider-lineage-mismatch");
    proof.child = { token: childToken, threadId: child.threadId, turnId: child.turnId, lineage, output: clean(childAnswer),
      childInputContainsSentinel: false, inheritedSentinelRecalled: true, inheritedGoalAbsentBeforeChildTurn: true, sharedWorkspace: true, liveOwners: 2 };

    stage = "child-stop-preserves-parent"; guard();
    const closedChild = await within(service.request(request("trusted.stop", { token: childToken })));
    const retainedParent = await within(service.request(request("trusted.snapshot", { token })));
    check(closedChild.status === "closed" && closedChild.runToken === childToken && cleanups.get(1)?.status === "confirmed", "child-cleanup-unconfirmed");
    check(retainedParent.status === "ready" && retainedParent.runToken === token && retainedParent.threadId === parent.threadId &&
      retainedParent.turnId === parent.turnId && retainedParent.output === parent.output && !cleanups.has(0), "child-stop-disturbed-parent");
    proof.childStop = { status: closedChild.status, cleanup: cleanups.get(1)?.status, parentStatus: retainedParent.status, parentOutputUnchanged: true };

    stage = "parent-followup-after-child-stop"; guard();
    const followup = `Reply exactly ${followupPhrase}. Do not read or modify files, use tools, or start other agents.`;
    const sent = await within(service.request(request("trusted.send", { token, text: followup, expectedTurnId: null })));
    check(sent.runToken === token, "parent-followup-target-mismatch");
    await waitFor(() => service!.snapshot(token).status === "ready"); guard();
    const followedParent = await within(service.request(request("trusted.snapshot", { token })));
    const unchangedChild = await within(service.request(request("trusted.snapshot", { token: childToken })));
    const followupAnswer = answerAfter(followedParent, `${parent.output}\nYou: ${followup}\n\n`);
    check(followedParent.threadId === parent.threadId && followedParent.turnId !== parent.turnId && followupAnswer.trim() === followupPhrase, "parent-followup-provider-answer-mismatch");
    check(unchangedChild.status === "closed" && unchangedChild.output === closedChild.output && !unchangedChild.output.includes(followupPhrase), "parent-followup-mutated-child");
    proof.parentFollowup = { token, sameThread: true, newTurn: true, output: clean(followupAnswer), childUnchanged: true, expectedTurnId: null };

    stage = "close-and-reopen-lineage-without-replay"; guard();
    const closedParent = await within(service.request(request("trusted.stop", { token })));
    check(closedParent.status === "closed" && cleanups.get(0)?.status === "confirmed", "parent-cleanup-unconfirmed");
    await within(service.shutdown()); guard();
    restored = new TrustedLocalService({ root, context: await within(createContext()), store: new FileTrustedLocalStore(storePath),
      createSession: async () => { replayAttempts++; throw new Boundary("history-created-provider-session"); } });
    const historicalParent = await within(restored.request(request("trusted.snapshot", { token })));
    const historicalChild = await within(restored.request(request("trusted.snapshot", { token: childToken })));
    const historicalLineage = historicalChild.runs?.find((run) => run.runToken === childToken)?.fork;
    check(historicalParent.instanceId !== parent.instanceId && historicalParent.archived && historicalChild.archived && historicalParent.status === "closed" && historicalChild.status === "closed" &&
      historicalParent.output === closedParent.output && historicalChild.output === closedChild.output && !historicalParent.forkPoint && !historicalChild.forkPoint &&
      JSON.stringify(historicalLineage) === JSON.stringify(lineage) && historicalChild.runs?.length === 2 && replayAttempts === 0, "archived-lineage-mismatch-or-replay");
    check(providerStarts === 2 && threadStarts === 1 && forkStarts === 1 && Number(turnStarts) === 3 && turns.length === 3 &&
      turns.every((turn) => Boolean(turn.turnId)) && turns[0]?.turnId === parent.turnId && turns[1]?.turnId === child.turnId && turns[2]?.turnId === followedParent.turnId &&
      turns[0]?.owner === 0 && turns[1]?.owner === 1 && turns[2]?.owner === 0 &&
      turns[0]?.threadId === parent.threadId && turns[1]?.threadId === child.threadId && turns[2]?.threadId === parent.threadId,
      "unexpected-provider-or-turn-count");
    check(startedTurns.length === 3 && startedTurns.every((started) => turns.some((turn) =>
      turn.owner === started.owner && turn.threadId === started.threadId && turn.turnId === started.id)), "observed-provider-turn-count-or-identity-mismatch");
    check((await readdir(root)).every((name) => name === ".git"), "provider-created-unexpected-workspace-file");
    proof.history = { records: 2, newInstance: true, bothArchived: true, outputsRetained: true, lineageRetained: true, forkPointsUnavailable: true, replayAttempts };
    reason = "completed"; ok = true;
  } catch (cause) { reason = cause instanceof Boundary ? cause.message : "proof-failure"; }
  finally {
    stopping = true; clearTimeout(deadline); listeners.clear();
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
    // Drain owners independently of persistence. Never signal a saved PID or
    // delete the disposable workspace if the owned boundary is unconfirmed.
    const hardCleanupDeadline = setTimeout(() => {
      console.error("Fork proof cleanup/evidence exceeded 15s; outcome unknown, owned guardian fallback retained. No retry.");
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
    const record = { ok, reason, stage, maximumTurns: 3, maximumConversations: 2, maximumGoalClears: 1, maximumGoalGets: 1,
      providerStarts, threadStarts, forkStarts, turnStarts, observedTurnStarts: startedTurns.length, goalClears, goalGets, replayAttempts,
      requestedExecutable: expectedExecutable, resolvedExecutable: codex, workspace: root, sharedWorkspace: true,
      attachedFiles: 0, modelOverride: null, providerConfigurationOverrides: false, approvalAnswered: false,
      noToolsRequested: true, observedToolActivity, absenceOfReadOnlyToolsAttested: false, deadlineMs, cleanupGraceMs: 15_000,
      tokens: { parent: parentToken ?? null, child: childToken ?? null }, nativeMetadata: { conversations, turns, startedTurns, goalOperations }, proof,
      cleanup: [...cleanups.entries()].map(([owner, value]) => ({ owner, status: value.status, observedAt: value.observedAt, detail: clean(value.detail) })),
      cleanupComplete, cleanupFinished, workspaceRemoved };
    await writeFile(join(evidence, "live-proof.json"), JSON.stringify(record, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify(record)); clearTimeout(hardCleanupDeadline); process.exitCode = ok ? 0 : 1;
    if (!cleanupFinished || !cleanupComplete) process.exit(1);
  }
}
void main().catch(() => { console.error("Fork live proof stopped before complete evidence; never remove a consumed marker or retry without renewed authorization."); process.exitCode = 1; });
