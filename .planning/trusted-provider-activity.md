# Readable trusted-provider activity

This living ExecPlan follows .planning/PLANS.md.

## Purpose / Big Picture

The local Codex conversation currently exposes only chat text and approvals. Add a compact history of commands, file edits, tool calls and turns so the fleet can show what an agent is doing without extracting it from prose. This increment exposes a core accessor; the fleet/UI departments join it separately.

## Progress

- [x] (2026-09-08 00:35Z) Read the assigned ownership, session event routing and official app-server item lifecycle documentation.
- [ ] Add focused failing tests, then the bounded activity projection.
- [ ] Verify native review, relevant local gates and one optional authorized live turn.
- [ ] Push ready PR, synchronize Ditz and hand off to ROOT without adoption.

## Context and Orientation

core/agents/trusted-local-session.ts owns one app-server conversation and validates JSON-line messages. It already checks thread and turn identity, buffers early item events, rejects malformed input, and closes only its owned transport. tests/trusted-local-session.test.ts uses a controlled transport. No production service, wire protocol or renderer change belongs to this increment.

## Assumptions and Decision Log

Provider started/completed events contain full items; completion may arrive before start, and duplicate or old-turn messages must not resurrect work. Activity is explanatory observation, never authority for task completion, approval or dispatch. Keep snapshot() unchanged. Add activity() returning cloned records with id, at, turnId, kind (command/fileChange/tool/turn), status (running/completed/failed) and summary. Bound count and encoded bytes without splitting Unicode. Summaries omit raw output, tool arguments, diffs, error bodies, credentials and configuration. Unsupported items remain ignored. Keep inherited trust and approval choices unchanged.

## Plan of Work

First add tests using existing controlled session transport to show readable exact-turn lifecycle, out-of-order terminal precedence, output privacy and bounds. Then add local activity storage and narrow projection helpers in the owned session file, reusing existing notification fences. Turn closure must not invent success for unfinished items. Add an independent focused Bazel target if needed and optional owned live evidence driver, never a model call in default tests.

## Concrete Steps and Validation

Run from /home/tedks/Projects/swarm-ide/trusted-provider-activity. Materialize with nix develop --command pnpm install --frozen-lockfile. Use nix develop --command bazel test //tools:quality --jobs=3 for types, tests and build, plus a focused manual Bazel target for these session cases. Before implementation new tests should fail; after implementation they should pass without changing existing snapshot assertions. A separately authorized manual live proof may submit exactly one benign turn in an owned empty Git repository, observe actual command/file/turn events, and stop the owned session. Controlled tests are not live evidence. UI verification is unnecessary for this core-only increment; no user display is touched.

## Surprises & Discoveries

Existing correlation and early-event buffering already supply the activity admission boundary; no second event transport or security layer is needed. Installed schema inspection is being done independently to avoid guessing tool statuses.

## Idempotence and Recovery

No storage migration or global changes. Tests use owned transports/workspaces, and live proof is explicit manual-only with no retry. Failures remain evidence, not an instruction to repeat a model turn. Preserve branch/history; ROOT merges normally and adopts.

## Outcomes & Retrospective

Pending implementation. The smallest join is F1 publishing session.activity() through its approved optional activities field; no provider completion or visible UI is claimed yet.

## Artifacts and Interfaces

Coordination is /tmp/swarm-ide-real-swarms.Djy75P/provider-activity/seam.md. The local activity interface deliberately matches the shared wave shape without importing unreviewed peer protocol code. Final evidence and limitations will be recorded here and in the PR.

Initial plan: bounded core event projection only, to preserve independent parallel implementation.
