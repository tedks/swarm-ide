# Preserve truthful live-agent status across bounded reads

This ExecPlan is a living document maintained according to `.planning/PLANS.md`.

## Purpose / Big Picture

Registered Goals conversations with explicit Codex lifecycle records should show their actual current turn state—working, waiting for the user, failed, completed, or unknown—through fleet refreshes and selected-conversation reads. The repair must recover supported lifecycle evidence that exists in a bounded transcript observation while refusing to infer an outcome from process presence, prose, old summaries, or activity. A focused test and a read-only invocation of the real observer against registered Goals metadata demonstrate the outcome without sending a message, starting a provider, changing the registry, or touching the physical desktop.

## Progress

- [x] (2026-09-11 01:37Z) Read the task packet, repository instructions, planning format, prior sanitized diagnostic, and verified the designated clean `fix/live-agent-status` worktree at `f08c75d5`.
- [x] (2026-09-11 01:37Z) Recorded the fresh-session readiness and ownership boundary in the assigned step directory.
- [ ] Trace actual `ExternalAgentService` snapshot/read output, protocol validation, and renderer retention to isolate one reproducible lifecycle loss.
- [ ] Add a sanitized failing regression and implement the smallest bounded, identity-safe correction.
- [ ] Update the agent design and exact plan/build mapping where the implementation changes their documented contract.
- [ ] Run focused Bazel tests and type/build gates, then obtain native and foreign council-review convergence.
- [ ] Push the ready PR, update and sync Ditz without closing the in-progress issue, clean owned resources, and write verification/final recap artifacts.

## Surprises & Discoveries

The prior inventory found accepted-format `task_complete` boundaries inside six current 256-KiB tails, so a cold bounded read should already publish those six as completed. That evidence narrows the investigation but does not establish what the previously open renderer received.

## Decision Log

- Decision: Diagnose the production service path before broadening parser limits or adding status heuristics.
  Rationale: The current tails contain supported lifecycle records, and PID presence, activity age, window labels, and transcript prose are not lifecycle authority.
  Date/Author: 2026-09-11 / Codex session `01a08e1b-56ce-7a23-8c27-e9b2009f4f44`.

- Decision: Any retained lifecycle must remain tied to the same validated session header, inode, and proven byte continuity; unknown gaps invalidate unsupported state.
  Rationale: Retaining status across a rewrite, rotation, malformed record, or missed boundary would fabricate an outcome.
  Date/Author: 2026-09-11 / Codex.

## Outcomes & Retrospective

Work is in progress. No source diagnosis or correction is yet claimed.

## Context and Orientation

`core/agent-lifecycle.ts` reduces validated JSONL records into the current lifecycle. `core/external-agents.ts` reads each registered transcript header and at most the latest 256 KiB, keeps an incremental per-session projection only across proven append continuity, and publishes summary/detail results. `protocol/external-agents.ts` validates those results. `app/renderer/external-agents/client.ts` serializes fleet and selected-detail observations; `RunStatus.tsx` and `ExternalAgents.tsx` display the lifecycle. A lifecycle boundary is an explicit `event_msg` record such as `task_started`, `task_complete`, or `turn_aborted`, with a valid outer timestamp and turn identifier. A cold read means no prior in-memory projection exists.

## Plan of Work

First invoke the real service in a separate read-only diagnostic process against the authorized registry and emit only session labels plus lifecycle/coverage metadata. Compare snapshot and selected-detail results and validate the same objects through the protocol parser. Then reproduce any identified reset/drop with sanitized temporary JSONL files in the existing external-agent test targets. Change only the owned lifecycle/cache/read or renderer status seam necessary to make that regression pass. Do not scan entire histories recurrently: if a missed boundary needs recovery, use a narrowly bounded per-session checkpoint tied to validated file identity and invalidate it on header/inode discontinuity. Update `docs/design/agents.md` and `.swarm/plans.json` only to reflect the actual implemented contract and target coverage.

## Concrete Steps

All project commands run from `/home/tedks/Projects/swarm-ide/live-agent-status` through Nix and Bazel. Use the focused `//tools/demo-agents:unit` target for lifecycle, service, client, and status regressions. Use `//:desktop-bundle` as the packaging/type gate if the implementation affects shared sources. A small owned packaged proof is optional only if unit/service evidence does not cover the concrete renderer mechanism.

## Validation and Acceptance

Sanitized tests must show that explicit supported metadata yields matching snapshot, detail, rail, and tab states across repeated reads. They must cover a latest start overriding an older completion, failed completion, abort, blocking user question and its answer, continuity loss, malformed/oversized data, and replacement without falsely retaining status. The real read-only diagnostic must show the supported current Goals tails with their parsed states and must not output transcript content, paths, commands, user input, tool output, or secrets.

## Idempotence and Recovery

All diagnostics are read-only. Test transcripts live only in owned temporary directories and existing cleanup hooks remove them. An interrupted source edit can be resumed from this plan and `git diff`; no live registry or application recovery action is permitted. The observer cache remains process-local and bounded.

## Artifacts and Notes

Sanitized verification and council summaries belong in `/tmp/swarm-ide-agent-visibility.xuxEvL/status/`. `seam.md` stays concise and records current commits, tests, PR, next action, and blockers. Private transcript content must never enter these artifacts or Git.

## Interfaces and Dependencies

Keep `AgentLifecycleProjection.consume(input: unknown): void` and the optional `ExternalAgentSummary.lifecycle` wire shape unless the diagnosis proves a narrowly necessary extension. Use existing Node filesystem APIs, Zod schemas, React state, and current Bazel targets; add no dependency and do not broaden renderer authority.

Initial plan recorded before implementation to make the trust, continuity, privacy, and failure assumptions explicit.
