# Steer an explicitly registered Codex session

This living plan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An operator can select a registered external Codex session, type an instruction in the IDE and deliberately queue it to that exact session without switching to tmux. The IDE displays queue acceptance, rejection before delivery, or uncertainty; none means that a model has consumed or completed the instruction. Existing checked tmux handoff remains available. External sessions are never killed or resumed by this feature.

## Progress

- [x] (2026-09-08 00:36Z) Read designated worktree instructions and current registry, transcript, tmux and protocol boundaries; inspected installed Codex 0.153.4 queue help.
- [x] (2026-09-08 00:48Z) Implement typed request, fixed queue sender and execution-time identity check; native review findings corrected with negative tests.
- [x] (2026-09-08 00:48Z) Implement explicit target UI and navigation-retained drafts/receipts; mounted negative/ambiguity tests pass.
- [x] (2026-09-08 00:53Z) Corrected local quality1830 tests and focused70 pass, each with one deliberately skipped opt-in self proof; all72 build targets pass. Final owned packaged proof passes with zero renderer errors and cleanup.
- [x] (2026-09-08 00:49Z) One authorized actual Codex0.153.4 queue message to this implementation session returned a correlated receipt. Consumption is not attested by that receipt.
- [x] (2026-09-08 00:54Z) Implementation pushed through89faa42 on PR76; code and fix deltas native CLEAN. Final docs/status handoff prepared for ready PR and Ditz synchronization.
- [ ] ROOT normal landing and shared app adoption (outside this child increment).

## Assumptions and Failure Modes

The IDE has the same machine authority as the operator's normal installed Codex, including its existing account/configuration. The renderer is not a source of executable, working directory or registry authority. The operator registry is outside the repository and names exact session UUID, rollout and tmux process identity. A session or registration can disappear or change during any await. Queue writes are not transactional with process identity observation: check immediately before dispatch, address the exact UUID, and make no claim of consumption. A spawned CLI can write successfully before failing or timing out; report delivery-unknown without automatic resend. Never terminate the observed agent while cleaning up the short-lived sender.

## Context and Orientation

`core/external-agents.ts` reads the private registry and bounded JSONL records; its observation ID identifies the header and inode. `core/external-agents-handoff.ts` checks the exact owned socket, pane, process start time, ancestry and open rollout descriptor. `protocol/external-agents.ts` validates requests and correlated responses through `protocol/schema.ts`. `core/worker-runtime.ts` dispatches that namespace. `app/renderer/external-agents/ExternalAgents.tsx` displays the selected session; the new `SessionSteering.tsx` is independent of the observer polling client owned by a parallel department.

## Plan of Work

First add `externalAgents.send` carrying session ID, observation ID and bounded text, with a receipt whose status is queued, rejected or delivery-unknown. Add a fixed privileged sender running the resolved normal Codex executable with argv `queue --thread UUID --message TEXT`, no shell or automatic retries. Re-read registration and transcript and validate current tmux identity immediately before sender invocation. Reserve an in-flight slot before awaits and reject duplicate request IDs without evicting their history. Disposal cancels and drains only owned CLI children.

Then mount a small session-specific composer with explicit target and Send. Preserve unsent text and unknown outcome on target changes, and correlate delayed receipts to their original target. Do not touch source focus, graph cameras, task drafts or the peer observer client.

Finally verify with actual owned files/processes and a packaged production UI under a disposable virtual X11 desktop. An executable fixture proves transport and UI without a model. One harmless message to this child session is the separately authorized real Codex queue proof. Native review checks the complete code and any fixes; local checks, not hosted CI, gate ROOT handoff.

## Concrete Steps

Work in `/home/tedks/Projects/swarm-ide/observed-session-steering`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Run `nix develop --command bazel test --jobs=3 //tools/demo-agents:unit`, `nix develop --command bazel test --jobs=3 //tools:quality`, and the new owned virtual `//tools/session-steering:smoke` through Bazel. Use Ditz issue `observed-session-steering-s3-20260907`. Push `feature/observed-session-steering` and open a draft PR early. ROOT owns normal merge and shared app adoption.

## Validation and Acceptance

Malformed IDs, NUL/blank/oversized text and extra renderer command authority fail schema validation. Wrong/missing/rotated rollout, stale process/pane/registration and synthetic registration do not spawn the sender. Literal shell punctuation is passed as one argument. A successful exact CLI receipt is queued, never consumed. Nonzero exit, malformed output, timeout or post-spawn cancellation is unknown and not retried. Disposal waits for owned CLI close; the external agent survives. Mounted and packaged UI tests preserve target-specific drafts, block duplicate Sends and retain source and cameras with zero renderer exceptions.

## Idempotence and Recovery

Read-only observations may be refreshed. A Send is never automatically repeated after failure or recovery; the user inspects the session before deciding a new instruction. No persistent queue or automatic replay is added. Owned proof resources have unique temporary directories and explicit cleanup. Preserve the interactive implementation session until ROOT retirement.

## Decision Log

Use the existing operator `SWARM_CODEX_BIN` or normal PATH resolution, fixed in privileged code, instead of adding a renderer-selected executable (2026-09-08, S3). Keep the optional isolated profile unchanged: trusted-local authority is explicitly approved. Keep UI and proof helpers independent and use a single reviewable product increment rather than splitting tightly coupled transport/UI into unjoinable branches.

## Surprises & Discoveries

Installed Codex 0.153.4 exposes `queue --thread <THREAD> --message <TEXT>`. Official CLI documentation fetched on 2026-09-08 describes interactive queuing but does not establish this installed command's receipt format; local help/binary strings and the bounded real queue proof are the authority for this version.

The attempted initial RED was a typecheck failure while the UI and protocol were being authored in parallel, not a claimed isolated behavioral regression. Native review then found two concrete classes with actual behavioral RED: metadata rewritten during either target check (two failures), and hidden information navigation losing drafts/receipts (three failures). Their corrected tests pass.

The first full suite caught14 task-bridge failures: eager import of the trusted resolver loaded task Git executable discovery during ordinary worker imports (123 `realpathSync(PATH/git)` attempts). The smallest correction defers that import until an explicit Send, before all target checks. The unchanged task no-filesystem/no-process assertions now pass. No failing test was weakened and no unchanged-head retry was counted as a fix.

## Outcomes & Retrospective

PR76 implements explicit queue steering in the existing information panel without changing the observer client, task context, isolated profile or other departments. Queue status is strictly correlated to the original session; wrong or changing targets are rejected, post-spawn ambiguity is unknown, and only the queue CLI is drained. Source buffers/cameras and unsent session instructions survive ordinary navigation.

Corrected implementation89faa42 passed all72 build targets, quality1830/137 files and focused70/6 files (each also skips the separately opt-in self test). The corrected packaged proof on owned display154/port55234 finished in2.084s including setup; native explicit Send, literal argv, stale/closed target rejection, navigation-retained drafts/receipt, source/camera retention, zero renderer errors, observed-process survival and cleanup all passed. Earlier successful proof was on the prior implementation; the final one uses the corrected code.

The actual single self-queue proof ran on3a18f25 before the import-timing-only correction and passed in536ms. It proves installed Codex queue acceptance, not provider work or consumption. It is deliberately not repeated. Ordinary GUI transport uses a disclosed controlled fixture with zero model turns. Native code review and both fix deltas converged CLEAN; foreign seats were not used under explicit Codex-only authority. Hosted CI was not a gate.

Non-durable external receipts/drafts across application reloads remain a scoped follow-up, Ditz `external-steering-durable-receipts`. The UI and docs disclose this limitation. No automatic replay, external stop/kill, transcript publication or ROOT app adoption was added.

## Artifacts and Notes

Short control handoff lives in `/tmp/swarm-ide-real-swarms.Djy75P/session-steering/seam.md`; final evidence is `packaged-corrected/run.VvH0up` beside it. `corrected-local.log`, `corrected-build.log`, `corrected-packaged.log` and the private self-send attempt/receipt preserve exact attribution. No private transcript or operator registry is checked into Git.

## Interfaces and Dependencies

`externalAgents.send` result is `{kind: 'send', sessionId, receiptId, status: 'queued' | 'rejected' | 'delivery-unknown', message}`. Node child-process APIs own the short-lived sender; existing tmux validation owns target identity checks. No added package or provider credentials are required.

Initial plan authored before product implementation, after stating the input, environment and failure assumptions.

2026-09-08 completion update: recorded review repairs, precise RED/green attribution, actual versus controlled proof and deliberate remaining lifecycle limitations. No product scope was expanded.
