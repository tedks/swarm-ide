# Native child conversations from a completed trusted run

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An operator can fork a ready IDE-owned Codex conversation at its last successful
completed turn. The new conversation inherits actual Codex history but has its
own run identity, input, Stop control and retained lineage. Both conversations
share the displayed directory; this is not a Git worktree or filesystem sandbox.
The initial deliverable is the typed backend plus a small independent UI control;
mounting that control requires ROOT to release W6's renderer ownership.

## Progress

- [x] (2026-09-08 01:40Z) Read current runtime, storage and wire contracts; inspect
  installed Codex 0.153.4 generated thread/fork schemas.
- [x] (2026-09-08 01:50Z) Add compatible typed fork request, completed-boundary capability and lineage; isolated UI form, W6 renderer untouched.
- [x] (2026-09-08 01:55Z) Prove lifecycle, correlation, duplicate and legacy boundaries locally. Initial4RED/81PASS, expanded123PASS; native findings reproduced2RED/123PASS then corrected127PASS.
- [x] (2026-09-08 02:03Z) One live proof at8af0d5a passed23.5s, two providers/three turns, both cleanup confirmed; backend and proof native review CLEAN.
- [x] (2026-09-08 02:10Z) ROOT released W6; normal composition41f2d24 includes exact reviewed1f54845. Small visible Fork/View-parent join implemented; targeted mounted gates pass before final copy adjustment.
- [ ] Finish joined owned-virtual proof and final local/review attribution.
- [ ] Push reviewed result, report exact visible join and leave ROOT to land.

## Surprises & Discoveries

Installed ThreadForkParams has inclusive lastTurnId, excludeTurns and
deferGoalContinuation. Thread reports forkedFromId; parentThreadId instead names
native subagent ancestry and must not be confused with a fork parent. There is
no persistExtendedHistory parameter in this installed schema.
Native review identified that deferred goals resume after the next explicit turn,
so a child must clear and read back its inherited goal before dispatch. Review
also identified that an evicted ordinary parent's token could be reused as a
child identity; retain all admitted tokens for the owner's lifetime, including
restored ancestry references, independently of twenty-record history eviction.

## Decision Log

Use only an observed successful completed boundary, never an active or recovered
history-only session. The provider pins lastTurnId, so later parent activity need
not mutate the selected boundary. The child receives a new explicit instruction
once after the returned distinct thread ID and forkedFromId are validated.
Deferring inherited goal continuation prevents an automatic turn before that
instruction. Clear and confirm the child goal is null before sending it, without
touching the parent's goal. No runtime permissions, tool or approval overrides
are introduced. Only fork connections opt into experimental API capability for
the installed deferGoalContinuation field and goal operations.

The renderer supplies a one-use childToken for correlation and recovery after a
lost acknowledgement. Persist requested lineage before creating a provider;
mark it confirmed only after the provider has acknowledged actual ancestry.
Parent task metadata is inherited context, not the child's assigned task: the
child's taskReference stays null. Existing preparations remain untouched.

## Outcomes & Retrospective

Native runtime and visible form implemented. Real8af0d5a proof created exactly
two Codex conversations and observed exactly three turns. The child's instruction
did not contain the random sentinel, yet its answer recalled it; native ancestry
and completed boundary matched. Explicit child Stop preserved parent output and
readiness, then a parent follow-up succeeded. Both explicit Stops confirmed owned
cleanup; private history retained both outputs and lineage with zero replay.
The child had no active goal in this proof (clear returned false, get returned
null); active-goal removal is controlled evidence only. No additional model turns.

Initial quality at pre-W6 backend passed1959 tests with one existing opt-in
external-self-message skip. Joined renderer focused tests and package are passing;
owned packaged deterministic-peer GUI evidence remains pending. ROOT owns merge,
final Ditz closure and app adoption. No claim of isolated worktrees, external ROOT
transcript cloning or automatic ticket completion belongs to this slice.

## Context and Orientation

`core/agents/trusted-local.ts` routes a bounded fleet of eight live and twenty
retained conversations. `trusted-local-session.ts` owns each Codex app-server
connection and its JSON-RPC requests. `trusted-local-store.ts` retains private
observations without recreating providers on restart. `protocol/trusted-local.ts`
defines validated renderer requests; `protocol/schema.ts` correlates their
responses and reports uncertain mutations on bridge loss.

## Plan of Work

Add a `trusted.fork` request with explicit parent token/thread/turn, child token,
instruction and optional normal model. Add optional fork lineage on run summaries
and a nullable selected-run fork point. The service admits the child durably and
reserves capacity before asynchronous setup. Session start chooses thread/fork
instead of thread/start, validates actual response ancestry and shared directory,
then sends the instruction once. Existing Stop, shutdown and history restoration
continue to apply independently to each owned session. Add an isolated renderer
form only after the backend seam is known; W6 files remain untouched until cleared.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/trusted-child-forks`.
Materialize with `nix develop --command pnpm install --frozen-lockfile`.
Run `nix develop --command bazel test //tools/trusted-forks:unit --jobs=3`
and `nix develop --command bazel build //:desktop-bundle --jobs=3`.
The manual live target requires explicit environment authorization and an owned
private evidence directory; ordinary tests never start a model.

## Validation and Acceptance

Controlled tests must reject stale/busy/unknown parents and duplicate child
tokens, preserve capacity through pending setup, distinguish ancestry mismatch
from confirmed forks, handle late acknowledgements and cancellation without
replay, retain lineage through storage/restart and preserve legacy records.
The real proof may create at most two conversations and send at most three model
turns in its own initially empty Git repository. A benign sentinel known only to
the parent must appear in the child's answer, with distinct thread IDs and exact
ancestry. Stopping the child must not stop the parent. Both owners must close.
This is provider/backend evidence, not full GUI evidence. Any UI proof uses an
owned virtual desktop (:157/55237), never ROOT's managed display.

## Idempotence and Recovery

An admitted child token is never replayable, even when setup fails or its reply
is lost. Restart loads observations only. A manual proof uses an exclusive
consumed marker to prevent accidental repeat; uncertain cleanup preserves the
owned directory for diagnosis. No user worktree or external agent is touched.

## Artifacts and Notes

Step evidence lives in `/tmp/swarm-ide-self-hosting.wkSErV/child-forks`.
Real proof record: `/tmp/swarm-ide-f2-live.gU1IJL/live-proof.json`; its consumed
marker is retained and must never be deleted to allow another run.
Installed schemas were generated read-only into
`/tmp/swarm-ide-codex-fork-schema.V8xa9U/typescript/v2`.

## Interfaces and Dependencies

Reuse TrustedLocalService, TrustedLocalSession, existing owned transport and
normal installed Codex. Optional fields preserve old consumers and storage.
No new package dependency, harness, config override or global agent skill edit.

Initial plan recorded before implementation; update with actual evidence and
review findings, not inferred success.
