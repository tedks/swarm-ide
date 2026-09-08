# Bounded trusted-local conversations and restart-safe history

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

The operator can keep several real local conversations running, address each by its fixed run token, and read their bounded history after restarting the IDE. Restart does not resume a provider or replay a message. The normal installed Codex account configuration and approvals remain authoritative.

## Progress

- [x] Read existing single-conversation service and frozen shared contract.
- [x] Add compatible typed summaries, activity, targeted snapshots and optional observed-turn send control.
- [x] Publish reviewed shared contract a6e7c8c in PR75; 1798 local tests passed.
- [x] Implement bounded per-token service and separate atomic trusted history store.
- [x] Verify routing, capacity races, cancellation, persistence failure and restart without replay in controlled tests.
- [x] Run relevant local checks and native review; push PR and synchronize Ditz.
- [x] Complete the authorized real two-conversation/three-turn proof with confirmed cleanup and no replay.
- [ ] ROOT normal landing and independent cockpit/activity/task consumer joins (not owned by this child).

## Surprises & Discoveries

The current session already bounds output and validates provider turn identities. Its service allows only one conversation and passes an empty observation callback. The old isolated run store encodes different admission rules and must not be reused for this profile.

Native review found a persistence completion race: a last callback could join an already-completed write barrier. Reinstating that exact old pump produced one failing public-callback test (72 passed); clearing writer ownership inside the same continuation closes the gap. A separate finding required lifetime writer exclusion across IDE/core instances, not merely serial writes inside one object. The new store holds a private advisory `flock` descriptor until its accepted queue drains and closes.

## Decision Log

Use at most eight live runs and twenty retained records, with one concurrent context preparation. Reserve a record before awaiting launch revalidation so duplicate clicks cannot allocate twice. Retain a separate store outside the repository; recovered active records become failed/archived with an explicit interrupted/unknown message, not an invented outcome. The existing status vocabulary is preserved for compatibility.

Persist a UTF-8 output tail of at most 128KiB and the last fifty activities with 2KiB summaries, further reducing old tails when JSON escaping would exceed 256KiB per record. Explicit omission text labels truncated output. The complete file remains under its 8MiB bound. Use `XDG_STATE_HOME/swarm-ide/trusted-local/<workspace-identity>.json`, or the normal `~/.local/state` fallback; another active IDE owner is rejected before reading/archiving its history. `flock` comes from the existing Nix util-linux environment, not a new dependency.

## Outcomes & Retrospective

Controlled multi-run, task materialization, restart-without-replay and lifetime writer tests passed: focused 74 tests across five files, full local quality 1847 across 137 files, with typecheck and renderer/core builds. Native full review found two Important defects, both corrected with clean convergence. The exact old pump reproduced one RED/72 PASS before correction; no broader baseline-red claim is made.

Actual manual proof completed at 2026-09-08 00:54 UTC: two real Codex 0.153.4 starts, three model turns, exact distinct initial replies, Stop A retaining B, a targeted follow-up only to B, both owned cleanups confirmed, and closed history reopened without replay. It attached no files, used normal provider settings, and answered no approval. It is not a UI proof, not a task-bearing model turn, and not independent attestation of zero read-only tools. The disposable Git workspace was removed only after confirmed cleanup; private evidence remains outside Git. Interrupted restart semantics are controlled tests, not an actual core-crash model experiment.

Crash-left temporary file garbage collection is tracked by Ditz issue `trusted-history-crash-temp-cleanup-20260907`; ordinary errors clean their owned temporary file. UI, optional provider activity, and task-linked presentation join independently under ROOT control.

## Context and Orientation

`protocol/trusted-local.ts` defines renderer/core data and controls. `core/agents/trusted-local.ts` owns context preparation and conversation routing. `core/agents/trusted-local-session.ts` owns exactly one Codex process transport and its normal approvals; the independent activity department owns its extensions. New `trusted-local-store.ts` persists only bounded history, never execution authority. `tests/trusted-local.test.ts` and new fleet/store tests exercise the service with controlled sessions.

## Plan of Work

First push the compatible protocol increment so the cockpit and task views can develop against it. Next replace the singleton service with per-token records, asynchronous initialization from the separate store, per-token control and lifecycle cancellation. Wire session observations into bounded persistence. Validate exact source/task materialization before creating each provider. Finally run local tests and native fix-delta review, and optionally prove two benign real conversations within the explicitly authorized three-turn ceiling.

## Concrete Steps

Work in `/home/tedks/Projects/swarm-ide/trusted-run-fleet`. Materialize dependencies using `nix develop --command pnpm install --frozen-lockfile`. Run checks exclusively through `nix develop --command bazel test //tools/trusted-fleet:unit //tools:quality --jobs=3` and build with `nix develop --command bazel build //:desktop-bundle --jobs=3`. The focused fleet target covers contracts, sessions, fleet and persistence without rerunning unrelated GUI proofs.

## Validation and Acceptance

Controlled sessions must demonstrate two independently addressable tokens, stopping one while another remains ready, stale-turn rejection before delivery, admission capacity reserved before awaits, late-owner cleanup, bounded retention, stored task reference integrity, and restart history with no session creation. Store tests cover malformed/versioned input and serialized atomic writes. Actual product model proof, if run, uses only a disposable owned Git repository and records its exact scope separately from controlled tests.

## Idempotence and Recovery

Repeated snapshots are read-only. Duplicate commands never replay. Failed persistence must be visible; launch cannot quietly proceed if admission recording fails. Do not delete user data or overwrite old isolated store files. Stop/shutdown drain only owned sessions. ROOT controls merges and managed app adoption.

## Artifacts and Notes

Operational seam and proof notes live in `/tmp/swarm-ide-real-swarms.Djy75P/fleet-core/`. Source and test commits are pushed to `feature/trusted-run-fleet`; ROOT receives the reviewed head, not uncommitted peer files.

## Interfaces and Dependencies

The contract adds optional `runs`, `taskReference`, `activities`, and `archived` fields without removing selected-run fields. `trusted.snapshot` accepts an optional run token; `trusted.send` optionally carries the observed turn identity, where null means start a next turn. `createSession(onChange)` permits live observations; an optional `activity()` accessor integrates the independently reviewed provider activity slice. The new store exposes asynchronous `load` and `save` of validated bounded run records.

`FileTrustedLocalStore.close()` rejects new operations, drains previously accepted operations, and releases its advisory writer lock. The service calls it only after all owned sessions and pending launches settle. Corrupt/unreadable history is not overwritten by shutdown. A persistence error blocks further new commands while retaining Stop authority.

Initial revision: record scope and compatibility assumptions before implementation.
Implementation revision: record actual race discoveries, bounded storage policy and exclusive writer lifetime.
