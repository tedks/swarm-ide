# Publish concrete Work Log milestones before an agent turn ends

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept current as work proceeds. Maintain this file in accordance with `.planning/PLANS.md`.

## Purpose / Big Picture

An operator watching several registered agents should see brief, concrete accomplishments in Work Log while long turns are still running. A successful edit, finished check, commit, or published pull request can become a saved **Milestone** without waiting for `task_complete`; later concrete work in the same turn can produce another milestone, and the eventual terminal event still produces exactly one **Completed turn** or **Failed turn** entry. Raw commands and edits remain in Activity, current liveness remains owned by the agent-status producer, and Work Log never treats a milestone or final-looking prose as proof of completion.

The behavior is visible in controlled Work Log tests: append a completed concrete tool operation to an owned registered transcript and observe one `working` milestone; append only prose, read-only inspection, malformed JSON, or no bytes and observe no additional inference; append another concrete operation and observe one more milestone; then append `task_complete` and observe one terminal entry without replaying either milestone.

## Progress

- [x] (2026-09-11 01:18Z) Read the milestone/common instructions, repository `AGENTS.md`, `.planning/PLANS.md`, and the existing Work Log source, tests, proof tooling, design, and build mappings.
- [x] (2026-09-11 01:18Z) Wrote the required fresh-session `ready` note and initialized the short step `seam.md` after verifying the designated clean worktree and branch.
- [x] (2026-09-11 01:24Z) Chose explicit saved-entry provenance and completed-tool evidence as the bounded admission rule before writing code.
- [x] (2026-09-11 01:34Z) Corrected the cursor design to one ordered transcript checkpoint, added a persisted first-seen batching window, and added cross-window Pause/publication linearization after focused source review exposed replay and race hazards.
- [x] (2026-09-11 01:39Z) Added RED transcript/service/UI regressions for ongoing milestones, deduplication, restart and tail movement, milestone-to-terminal transitions, errors/aborts, batching, provenance repair, and cancellation/ownership races; the first focused run failed on the intentionally absent protocol/input fields.
- [x] (2026-09-11 01:41Z) Implemented bounded transcript milestone extraction, one ordered persisted checkpoint, persisted batching, provenance-safe publication, and Pause publication linearization without changing agent liveness or registry ownership.
- [x] (2026-09-11 01:47Z) Updated summarizer context, saved-entry provenance, UI copy, design documents, and exact `.swarm/plans.json` source/target mappings.
- [x] (2026-09-11 02:25Z) Ran the focused Nix/Bazel Work Log and awareness gates after review fixes; 127 controlled Work Log/task/UI tests pass, and the awareness target passes with the updated source mapping. The earlier broader living-design bundle retained its recorded unrelated planning-UI failures.
- [x] (2026-09-11 02:25Z) Ran exactly one disposable `gpt-5.6-luna` summary over fixed synthetic milestone input through a temporary Bazel-only harness; it returned ongoing-work wording, made no Ditz write, and the harness was removed.
- [x] (2026-09-11 02:25Z) Pushed granular commits to draft PR #150, updated the in-progress Ditz issue, and ran provider-diverse council fix deltas until Codex, Claude Sonnet, and Google returned CLEAN on `4d4cafcf..2340e667`.

## Surprises & Discoveries

- Observation: `core/work-log/transcripts.ts` currently retains ongoing evidence in memory while parsing but returns only the latest nonempty `task_complete`; it therefore cannot publish during a long turn.
  Evidence: `readWorkEvidence` assigns its only returned boundary inside the `task_complete` branch and discards remaining ongoing evidence at function exit.

- Observation: modern recorded operations may arrive as `custom_tool_call` / `custom_tool_call_output` around a `functions.exec` wrapper, not only as legacy `function_call` records.
  Evidence: `core/external-agents-activity.ts` already parses literal top-level `exec_command` and `apply_patch` calls from that wrapper and its dedicated tests exercise the format.

- Observation: the existing service already provides deterministic `inputs`, `completions`, and `summarize` injection, kernel-lock ownership, pre-inference attempt persistence, and post-inference Pause/disposal rechecks. The smallest implementation extends those seams rather than creating a scheduler or event bus.
  Evidence: `WorkLogDependencies` and `WorkLogService.tick` in `core/work-log/service.ts`, plus the existing controlled tests in `tests/work-log.test.ts`.

- Observation: legacy repair currently treats every saved `state: "working"` row as an old terminal-summary bug. A real ongoing milestone would be corrupted on restart unless it has explicit provenance.
  Evidence: `repairLegacyEntries` filters only on `entry.state === "working"`.

- Observation: the first RED `//tools/work-log:check` run stopped in TypeScript with the expected missing `origin`, checkpoint, and deterministic clock interfaces; after the implementation and fixture corrections, the same target passed all 116 selected tests.
  Evidence: Bazel reported the initial protocol/input errors, then `//tools/work-log:check PASSED` in 19.0 seconds with controlled summarizers only.

- Observation: the repository-wide living-design bundle's plan readers and component-graph tests pass with the updated mapping, while 13 unrelated planning UI/bridge cases fail with “Could not read the plan” and cross-response authority mismatches.
  Evidence: `//tools/living-design:checks` reported 89 passing tests, including all `plans-reader`, `component-graph-stability`, and `living-design` tests, plus 13 failures isolated to `planning-ui` and `demo-plan-actions`; no Work Log assertion failed.

- Observation: the first provider-diverse council round found byte/character checkpoint drift, post-abort and nested-session terminal revival, quote-blind command admission, insufficient privacy scrubbing, unbounded turn and generated-entry identities, silent completed operations being dropped, and unenforced provenance/state combinations.
  Evidence: new focused regressions failed in seven expected cases before the fixes; after byte-oriented parsing, checkpoint kinds, active-span admission, bounded hashes, stricter prefixes/scrubbing and protocol validation, `//tools/work-log:check` passed all 123 selected tests. The Claude seat returned no report during its single bounded attempt and was not substituted.

- Observation: delayed Claude convergence found missing-turn terminals and closed checkpoints beyond the finite tail needed separate continuity rules.
  Evidence: a missing terminal turn now inherits the active owned turn only while ownership remains live; a closed checkpoint beyond the tail accepts only an explicit different terminal turn. Focused post-abort, missing-ID and 530 KiB gap regressions pass, bringing the controlled count to 127.

## Decision Log

- Decision: Admit ongoing milestones only after a completed tool operation with concrete accomplishment potential: a patch/edit, a test/build/type/lint/check command, a state-changing Git/PR command, or an explicit Ditz lifecycle/note command. Assistant prose, tool invocation without its matching result, read-only inspection commands, generic tool noise, and partial JSONL do not trigger inference.
  Rationale: a tool result proves that an operation finished, while prose or an invocation proves only intent. The summarizer receives the bounded sanitized result so it can report success, failure, or remaining work without inventing completion. This rule covers the requested examples while preventing a model call on every poll or status command.
  Date/Author: 2026-09-11 / Codex

- Decision: Reuse the literal, non-evaluating operation extraction already exported by `core/external-agents-activity.ts` to recognize direct calls and `functions.exec` wrappers, then correlate their call IDs with result records in Work Log.
  Rationale: duplicating a JavaScript wrapper parser would create divergent security and attribution behavior. Work Log adds only its narrower admission classifier and private result text; Activity remains the raw-event owner.
  Date/Author: 2026-09-11 / Codex

- Decision: Add `origin: "milestone" | "terminal"` to newly generated saved entries while leaving it optional for old documents. Legacy repair processes only origin-less `working` rows.
  Rationale: milestones deliberately remain `working` as historical in-progress accomplishments, so execution state alone cannot distinguish them from legacy terminal rows. Optional provenance preserves existing documents without a destructive migration.
  Date/Author: 2026-09-11 / Codex

- Decision: Preserve legacy terminal `seen` only for backward migration and add one ordered per-session transcript checkpoint shared by milestone, abort, and terminal processing. The checkpoint carries the validated transcript identity, absolute complete-line byte offset, anchor, and evidence time.
  Rationale: separate milestone and terminal cursors could each rediscover evidence paid by the other and alternate after restart. One append-order cursor makes the later terminal naturally follow milestones once and allows old offsets to stay valid when the 512 KiB tail moves.
  Date/Author: 2026-09-11 / Codex

- Decision: Derive a stable milestone boundary from the validated transcript identity, absolute result-line byte offset, and exact result-line bytes; retain a bounded/hash-normalized owning-turn identity and checkpoint kind alongside it. When the prior boundary is still in the 512 KiB tail, aggregate only later concrete operations; when it has moved out, admit only a newer latest operation rather than resending the tail.
  Rationale: byte-derived boundaries do not drift on malformed UTF-8 or tail movement. Turn provenance and checkpoint kind keep empty-terminal fallback specific to a paid milestone in the same turn and prevent abort, nested-session and earlier-terminal spans from being revived.
  Date/Author: 2026-09-11 / Codex

- Decision: Keep the current maximum four inputs per inference and let unselected fresh candidates remain uncheckpointed for the next automatic tick. Age eligibility applies to the concrete evidence time, not turn start time.
  Rationale: this preserves the existing model/input bound, handles several agents fairly through the existing newest-first batch, and allows a long-running old turn to publish newly completed work.
  Date/Author: 2026-09-11 / Codex

- Decision: Persist a per-session pending milestone with its first-observed time. New concrete evidence joins that window without resetting its start; only a window at least `debounceSeconds` old becomes billable. Terminal inputs remain immediately eligible and supersede pending milestone work.
  Rationale: the existing delay is scheduled after a tick and activation runs immediately, so it is not a batching debounce. A persisted fixed window batches bursts, survives restart, avoids starvation during continuous work, and begins a new window only after an attempted milestone checkpoint.
  Date/Author: 2026-09-11 / Codex

- Decision: Serialize watcher preference writes and the final post-summary Pause check/document publication with a small publication lock, always nested producer-lock then publication-lock.
  Rationale: same-instance Stop drains correctly, but a second window could otherwise return from Pause in the gap after the last check and before the document save. Linearization guarantees no older output appears after Pause returns without changing inference ownership.
  Date/Author: 2026-09-11 / Codex

## Outcomes & Retrospective

The implementation, controlled verification, one synthetic real-summary proof, and provider-diverse council convergence are complete. Registered long-running turns now yield concise saved Milestones only after matched concrete operation results; one ordered byte checkpoint and persisted batch window prevent idle/restart/tail replay, while exact `task_complete`, abort/nested/fork ownership, Pause/disposal/settings and cross-window publication remain independently guarded. Explicit provenance protects historical milestones from legacy repair and the UI labels them without claiming current liveness.

The feature stayed inside the existing registered-transcript reader, shared Activity literal-operation extractor, single core producer, saved Work Log document, protocol and panel; it added no agent discovery, liveness inference, generic event system, dashboard, Goals writes, automatic Ditz action, or App wiring. The one intentionally retained limit is fail-closed ambiguity: after a closed checkpoint has fallen outside the 512 KiB tail, a different explicit terminal may bridge the gap, but ongoing evidence waits for a visible owned `task_started`.

## Context and Orientation

`core/work-log/transcripts.ts` opens only canonical, operator-owned transcript files named in the private external-agent registry. It validates the matching session header, reads at most the most recent 512 KiB, ignores oversized/malformed/partial records, enforces fork ownership, scrubs private paths and credentials, and currently emits only completed turns. A **milestone checkpoint** in this plan is a private record of the latest concrete ongoing evidence already admitted for summarization; it is not agent status and does not appear in Activity.

`core/work-log/service.ts` is the sole producer. The primary core activates it, a repository-wide `flock` excludes competing windows, `.git/swarm-work-log/state.json` stores settings and attempted boundaries, `.git/swarm-work-log/watcher.json` stores Pause, and `.swarm/work-log.json` stores the latest 200 human-readable entries. `tick` persists attempts before calling a deterministic injected or real summarizer and rechecks Pause/disposal before publication. `repairLegacyEntries` is a bounded non-model migration for historical rows whose old producer incorrectly saved terminal summaries as `working`.

`core/work-log/commands.ts` owns the configured Codex summary subprocess and explicit Ditz recording. Its input and output sizes, process group, timeout, schema, privacy scrub, and default `gpt-5.6-luna` model remain unchanged. The prompt must learn that milestone inputs are ongoing accomplishments and must not claim task or turn completion. No test may invoke the production summarizer.

`protocol/work-log.ts` validates settings, saved entries, requests, and snapshots. `app/renderer/work-log/WorkLogPanel.tsx` renders historical entry labels independently of current agent liveness. It will label explicit milestone provenance as **Milestone**, retain **Completed turn** / **Failed turn** for terminal entries, and describe the empty running state as watching for concrete updates rather than only completed turns.

`tests/work-log.test.ts` contains controlled node tests for activation, Pause/restart, cross-window locks, cancellation, persisted attempts, batch overflow, transcript ownership, finite tails, terminal failures, and legacy repair. `tests/work-log-ui.test.tsx` contains renderer-only labels and controls. `tools/work-log/BUILD.bazel` exposes the focused `//tools/work-log:check` and `//tools/work-log:awareness-check` Bazel tests. `docs/design/activity.md`, `docs/work-log-implementation.md`, and the `design:activity` node in `.swarm/plans.json` must describe and map the implemented pipeline exactly.

Assumptions are that registered transcripts remain append-oriented in normal operation but may be truncated or replaced; record timestamps and call IDs are untrusted and may be missing; and the finite tail may begin after the turn start or prior checkpoint. Outside those conditions the reader fails closed: it skips ambiguous ownership, malformed events, unmatched results, stale or unchanged concrete boundaries, and unsafe files. A failed summarizer attempt remains checkpointed and is not automatically retried; later genuinely new evidence may create one new attempt. A milestone may remain saved after its turn aborts, but it never changes to completed unless a distinct valid terminal event produces a separate entry.

## Plan of Work

First extend tests with transcript helpers that append owned, timestamped calls/results and terminal events. Prove the absent behavior at the transcript boundary and service boundary before implementation where practical. Cover direct functions, the literal `functions.exec` wrapper, fork/nested ownership, unmatched/noisy/partial records, a prior checkpoint leaving the bounded tail, and a turn whose start is old but concrete work is recent.

Then update `core/work-log/transcripts.ts` to correlate supported tool calls and their results inside the currently owned turn. Reuse `extractEntries` for safe literal attribution, filter its entries through the narrow concrete-command rule, sanitize/cap the corresponding result, and produce at most one ordered input per session after the supplied transcript checkpoint. The reader records a validated file identity and absolute complete-line byte offset so a moved tail begins after already-paid evidence. Keep terminal collection authoritative, and return non-billable abort/legacy-terminal cursor advances alongside billable inputs.

Update `core/work-log/service.ts` so the backward-compatible private state schema has an ordered checkpoint and pending first-seen milestone per session. Apply non-billable advances, stage milestone inputs until their persisted window is due, and persist selected paid checkpoints before inference. Publication adds explicit provenance. Legacy repair ignores explicit milestones. Retain the kernel lock, maximum-four batch, 30-minute bootstrap window based on each input's evidence time, existing backoff, and every Pause/settings/disposal recheck; add a consistently ordered publication lock around preference changes and the last publication decision.

Update `core/work-log/commands.ts` to give the summarizer origin/state context and explicitly forbid terminal claims for milestones. Update the protocol and panel copy, then update design and component mappings. No new settings or App wiring are expected.

Finally run the focused Nix/Bazel targets with controlled summarizers, plus protocol/living-design validation as required by the mapping change. Use no production agent tasks. If a live proof is still useful, create a disposable owned repository and registered synthetic transcript, invoke configured Luna at most once through a safe proof path that cannot write Ditz, record it separately from controlled-test evidence, and remove owned temporary resources. Do not run `//tools/work-log:proof` unmodified.

## Concrete Steps

Work from `/home/tedks/Projects/swarm-ide/work-log-milestones` on `feature/work-log-milestones`.

After each coherent edit, inspect `git diff --check` and the focused diff, update this plan and `/tmp/swarm-ide-live-awareness.UonFxG/milestones/seam.md`, then commit and push. Create an early draft pull request after the planning/test scaffold commit.

Run focused verification only through Nix and Bazel:

    nix develop --command bazel test --jobs=3 //tools/work-log:check //tools/work-log:awareness-check --test_output=errors

After updating `.swarm/plans.json`, run its declared living-design validation target if it is not already covered by the focused gates. Run `//tools/operator-cockpit:worklog-position` only if mounting or surrounding cockpit layout changes; a label-only component change is covered by Work Log UI tests.

Before handoff, run proportional `council-review` on the ready pull request, fix every Critical/Important finding, file or resolve lesser actionable findings, and re-review each fix delta until a round is clean. Post the convergence result to the PR. Then follow the repository landing-the-plane workflow: update the in-progress Ditz issue without closing it, `git pull --rebase`, `ditz sync`, `git push`, verify clean/up-to-date status, clear only owned stashes/resources, and write `verification.md` plus the exact-marker `final-recap` in the milestone step directory.

## Validation and Acceptance

Controlled tests must demonstrate all of the following without a real model: ongoing concrete tool completion creates one milestone before `task_complete`; a later concrete completion creates exactly one more; unchanged reads, repeated intentions, read-only/noisy tools, partial JSONL, and idle polling create no call; restart and 512 KiB tail movement preserve paid checkpoints; five or more candidates drain across bounded automatic batches; an eventual success or explicit-error `task_complete` produces one separate terminal row; `turn_aborted` never produces a terminal completion; failed paid attempts do not replay; explicit milestones bypass legacy repair; older saved entries and `recorded`/task fields survive; and Pause, settings changes, disposal, and competing windows prevent stale or duplicate publication.

UI tests must show **Milestone** for explicit milestone provenance, unchanged terminal labels, no current-liveness claim from old/legacy rows, and running empty copy that includes ongoing concrete updates. Protocol parsing must accept old origin-less saved documents and reject unknown provenance.

The focused Bazel checks must pass under `nix develop`. Any optional real Luna evidence must be exactly one call over synthetic owned input, with zero Ditz writes and no use of existing Goals/user transcripts; its output must be labeled as model evidence rather than controlled test evidence.

## Idempotence and Recovery

All transcript reads are read-only and bounded. Re-running a tick with unchanged bytes returns the same evidence boundary and therefore makes no model call. Private state is atomically replaced only after validating the existing schema, and attempts advance before inference so a crash or provider failure does not rebill them. The kernel lock is process-owned and self-releases; it must never be repaired by deleting another process's lock file. Pause aborts and drains only this service's owned summary process.

If a test or implementation step fails, preserve the failing fixture/output, fix forward, and rerun only the focused target. Do not reset or overwrite unrelated work. If the private state or saved Work Log is malformed, surface the existing notice and leave it untouched. Temporary proof repositories/processes must live under a uniquely created `/tmp` directory and be cleaned by their owner.

## Artifacts and Notes

Required session artifacts live in `/tmp/swarm-ide-live-awareness.UonFxG/milestones`: `ready`, the maintained `seam.md`, final `verification.md`, and final `final-recap`. The repository artifact for this implementation is this ExecPlan plus source/tests/design changes; no private transcript or live generated Work Log entry is committed.

Current baseline is `f08c75d546f3e59aba0e5b7bebfe074e8b1c37f3`. Baseline inspection, not an executed test, found 24 core Work Log tests, 11 Work Log UI tests, 37 task-client tests, and 3 awareness-plan tests selected by the two focused targets.

## Interfaces and Dependencies

At completion, `WorkInput` in `core/work-log/transcripts.ts` has explicit `origin: "milestone" | "terminal"` and its next ordered transcript checkpoint. `readWorkInputs(root, registryPath, checkpoints, legacySeen)` accepts one per-session checkpoint map plus the old terminal boundary map needed during migration and returns at most one newest eligible input per registered session. A checkpoint contains validated transcript identity, absolute complete-line offset, stable anchor, and ISO timestamp. The production observation also returns non-billable checkpoint advances; `WorkLogDependencies` retains a simple injectable input seam for deterministic tests.

`WorkLogEntrySchema` in `protocol/work-log.ts` accepts optional `origin: "milestone" | "terminal"`; all new generated entries set it, while existing documents without it remain valid. `StateSchema` in `core/work-log/service.ts` preserves version 1 compatibility by defaulting a new milestone-checkpoint record when absent. No public request type or renderer authority changes.

`summarizeWork` keeps the current `WorkSummary[]` output and process contract. Its untrusted input data includes origin and terminal state so one same-order batch can contain ongoing milestones and terminal outcomes safely.

Plan revision note (2026-09-11 01:24Z): created the initial self-contained plan after source/test/design inspection; recorded the admission, checkpoint, provenance, tail-recovery, batching, and race decisions required before implementation.

Plan revision note (2026-09-11 01:34Z): replaced independent milestone/terminal cursors with one ordered byte checkpoint, made batching a persisted first-seen window, and added Pause/publication linearization after focused review found that the initial design could alternate cursors, bill immediately on activation, and publish after another window returned from Pause.

Plan revision note (2026-09-11 02:08Z): incorporated first-round council findings with byte-accurate line handling, checkpoint kind/turn provenance, active-span terminal admission, bounded identities, stricter privacy/command admission, silent-result handling, and protocol state invariants; recorded the unavailable Claude seat and new RED/GREEN evidence.

Plan revision note (2026-09-11 02:18Z): distinguished active missing-ID terminals from closed-checkpoint tail gaps after delayed Claude convergence; retained fail-closed milestone ownership while allowing only an explicit different terminal to bridge a closed gap.

Plan revision note (2026-09-11 02:25Z): recorded the final timestamp-ordering fix, 127-test GREEN evidence, one synthetic Luna proof, and three-provider CLEAN convergence; replaced the provisional outcome with the completed implementation and its deliberate fail-closed tail-gap limit.
