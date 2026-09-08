# Steer an explicitly registered Codex session

This living plan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An operator can select a registered external Codex session, type an instruction in the IDE and deliberately queue it to that exact session without switching to tmux. The IDE displays queue acceptance, rejection before delivery, or uncertainty; none means that a model has consumed or completed the instruction. Existing checked tmux handoff remains available. External sessions are never killed or resumed by this feature.

## Progress

- [x] (2026-09-08 00:36Z) Read designated worktree instructions and current registry, transcript, tmux and protocol boundaries; inspected installed Codex 0.153.4 queue help.
- [ ] Implement typed request, fixed queue sender and execution-time identity check.
- [ ] Implement explicit target UI and negative/ambiguity tests.
- [ ] Run relevant local, native convergence and owned virtual packaged proof; one real message to this implementation session only.
- [ ] Push ready PR and synchronize Ditz for ROOT landing.

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

## Outcomes & Retrospective

Implementation and evidence pending. No real provider completion or consumption has been claimed.

## Artifacts and Notes

Short control handoff lives in `/tmp/swarm-ide-real-swarms.Djy75P/session-steering/seam.md`; owned proof output will live beside it. No private transcript or operator registry is checked into Git.

## Interfaces and Dependencies

`externalAgents.send` result is `{kind: 'send', sessionId, receiptId, status: 'queued' | 'rejected' | 'delivery-unknown', message}`. Node child-process APIs own the short-lived sender; existing tmux validation owns target identity checks. No added package or provider credentials are required.

Initial plan authored before product implementation, after stating the input, environment and failure assumptions.
