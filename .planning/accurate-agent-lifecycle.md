# Show what agents are actually doing

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

The cockpit must distinguish an agent currently working, waiting for a human,
failing, or completing its turn. A saved accomplishment is about a past turn;
starting another turn must not turn that accomplishment back into ongoing work.
Recording the accomplishment in Ditz is a separate action.

## Progress

- [x] (2026-09-08) Confirmed WorkLogService writes completed-turn summaries as working.
- [x] Read the wave ownership and inspected current observer and Work Log files.
- [ ] Implement and publish the shared lifecycle contract and bounded transcript projection.
- [ ] Repair new and corroborated legacy Work Log states without new summary calls.
- [ ] Run focused regression checks, native review, push a ready PR and hand off.

## Surprises & Discoveries

The external observer already bounds individual tails and the whole fleet, but
only exposes whether a transcript was readable. That availability is not an
execution state. Work Log recording currently changes the execution label.

## Decision Log

Use only explicit own-session harness events, not file age, tmux presence or a
tool command failing. Unknown is a legitimate state when the bounded observation
does not contain sufficient evidence. Compute lifecycle before trimming activity.
Keep schema fields additive for older saved records and existing UI consumers.

## Outcomes & Retrospective

Implementation and evidence pending. The activity-ui department owns visible
badges; this department publishes core state and preserves saved outcomes.

## Context and Orientation

`core/external-agents.ts` reads explicitly registered Codex JSONL files and
publishes `protocol/external-agents.ts` snapshots. `core/work-log/transcripts.ts`
finds completed turns; `core/work-log/service.ts` summarizes them into the saved
`.swarm/work-log.json`. `protocol/work-log.ts` validates that document.

## Plan of Work

Add a shared small lifecycle schema and pure reducer over supported harness
records. Feed the reducer from the external observer before its entry limits,
excluding inherited records using the session creation metadata. Publish an
optional lifecycle object on each observed session. Correct Work Log production
and narrowly migrate only states corroborated by exact completion boundaries.
Document the semantics in the two corresponding living component docs.

## Concrete Steps

In this worktree, materialize dependencies with
`nix develop --command pnpm install --frozen-lockfile`. Use
`nix develop --command bazel test --jobs=3 //tools/demo-agents:unit //tools/work-log:check --test_output=errors`
for focused parser, service, compatibility and type checks. Publish source with
granular commits and a draft PR. Write the committed API and evidence into
`/tmp/swarm-ide-usability.BirZCk/agent-state/seam.md` for the UI owner.

## Validation and Acceptance

Test start/completion, stale turn identities, correlated human input, explicit
terminal failure, inherited history, and activity trimming. New completed-turn
outcomes must be completed without Ditz recording; old outcomes must retain their
text and recorded flag and incur no model call during repair. Unsupported or
missing evidence must not be called working or failed. No physical GUI test or
real provider turn is needed for this core-only increment.

## Idempotence and Recovery

Keep persisted outcomes and private producer attempt history intact. Migration
must preserve user data and serialize with existing producer locks. Never replay
agent or summarizer execution to discover status. ROOT owns merge and adoption.

## Artifacts and Notes

Evidence and final handoff live in the assigned `/tmp` step directory. The PR
retains source, tests, design notes and this plan, not private transcripts.

## Interfaces and Dependencies

Use existing Zod contracts and Node file readers. Shared lifecycle values are
working, waiting, failed, completed and unknown, with an evidence timestamp and
turn identity only where established. No provider, registry or process-control
dependency is added.
