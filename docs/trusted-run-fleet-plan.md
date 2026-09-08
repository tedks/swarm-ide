# Bounded trusted-local conversations and restart-safe history

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

The operator can keep several real local conversations running, address each by its fixed run token, and read their bounded history after restarting the IDE. Restart does not resume a provider or replay a message. The normal installed Codex account configuration and approvals remain authoritative.

## Progress

- [x] Read existing single-conversation service and frozen shared contract.
- [x] Add compatible typed summaries, activity, targeted snapshots and optional observed-turn send control.
- [ ] Publish reviewed shared contract for independent cockpit/task consumers.
- [ ] Implement bounded per-token service and separate atomic trusted history store.
- [ ] Verify routing, capacity races, cancellation, persistence failure and restart without replay.
- [ ] Run relevant local checks and native review; push PR and synchronize Ditz.

## Surprises & Discoveries

The current session already bounds output and validates provider turn identities. Its service allows only one conversation and passes an empty observation callback. The old isolated run store encodes different admission rules and must not be reused for this profile.

## Decision Log

Use at most eight live runs and twenty retained records, with one concurrent context preparation. Reserve a record before awaiting launch revalidation so duplicate clicks cannot allocate twice. Retain a separate store outside the repository; recovered active records become failed/archived with an explicit interrupted/unknown message, not an invented outcome. The existing status vocabulary is preserved for compatibility.

## Outcomes & Retrospective

Implementation and proof are in progress. No multi-run or persisted provider behavior is claimed yet.

## Context and Orientation

`protocol/trusted-local.ts` defines renderer/core data and controls. `core/agents/trusted-local.ts` owns context preparation and conversation routing. `core/agents/trusted-local-session.ts` owns exactly one Codex process transport and its normal approvals; the independent activity department owns its extensions. New `trusted-local-store.ts` persists only bounded history, never execution authority. `tests/trusted-local.test.ts` and new fleet/store tests exercise the service with controlled sessions.

## Plan of Work

First push the compatible protocol increment so the cockpit and task views can develop against it. Next replace the singleton service with per-token records, asynchronous initialization from the separate store, per-token control and lifecycle cancellation. Wire session observations into bounded persistence. Validate exact source/task materialization before creating each provider. Finally run local tests and native fix-delta review, and optionally prove two benign real conversations within the explicitly authorized three-turn ceiling.

## Concrete Steps

Work in `/home/tedks/Projects/swarm-ide/trusted-run-fleet`. Materialize dependencies using `nix develop --command pnpm install --frozen-lockfile`. Run checks exclusively through `nix develop --command bazel test //tools:quality --jobs=3` and build with `nix develop --command bazel build //:desktop-bundle --jobs=3`. A focused fleet target may be added to avoid rerunning unrelated GUI proofs.

## Validation and Acceptance

Controlled sessions must demonstrate two independently addressable tokens, stopping one while another remains ready, stale-turn rejection before delivery, admission capacity reserved before awaits, late-owner cleanup, bounded retention, stored task reference integrity, and restart history with no session creation. Store tests cover malformed/versioned input and serialized atomic writes. Actual product model proof, if run, uses only a disposable owned Git repository and records its exact scope separately from controlled tests.

## Idempotence and Recovery

Repeated snapshots are read-only. Duplicate commands never replay. Failed persistence must be visible; launch cannot quietly proceed if admission recording fails. Do not delete user data or overwrite old isolated store files. Stop/shutdown drain only owned sessions. ROOT controls merges and managed app adoption.

## Artifacts and Notes

Operational seam and proof notes live in `/tmp/swarm-ide-real-swarms.Djy75P/fleet-core/`. Source and test commits are pushed to `feature/trusted-run-fleet`; ROOT receives the reviewed head, not uncommitted peer files.

## Interfaces and Dependencies

The contract adds optional `runs`, `taskReference`, `activities`, and `archived` fields without removing selected-run fields. `trusted.snapshot` accepts an optional run token; `trusted.send` optionally carries the observed turn identity, where null means start a next turn. `createSession(onChange)` permits live observations; an optional `activity()` accessor integrates the independently reviewed provider activity slice. The new store exposes asynchronous `load` and `save` of validated bounded run records.

Initial revision: record scope and compatibility assumptions before implementation.
