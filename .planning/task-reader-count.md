# Load ordinary task backlogs without an issue-count cap

This ExecPlan follows `.planning/PLANS.md` and is maintained as work proceeds.

## Purpose / Big Picture

The user sees `TASK_LIMIT_EXCEEDED` with about 263 small Ditz issues. Remove the
arbitrary 256-issue rejection so ordinary task lists load; preserve byte, timeout,
shape, path, identity, atomic cache and pinned-context controls. ROOT lands this
independent repair and adopts it; no shared app or user metadata test writes.

## Progress

- [x] (2026-09-08) Selected authorized new `fix/task-reader-count` in the existing worktree, based on current origin/master `f9df9b8`; old branch preserved.
- [x] (2026-09-08) Located count gates in Git reader, YAML batch parser and task snapshot schema, plus fixed Git batch framing allowances.
- [ ] Add >256 direct regression and capture its old-code failure.
- [ ] Remove count gates and derive bounded Git batch framing from selected tree entries.
- [ ] Run focused reader/provider/contract/types and read-only current-repo proof, native review to clean, push PR and Ditz handoff.

## Context and Orientation

`protocol/tasks.ts` defines per-field and full-message limits; its summaries array
also caps issue count. `core/tasks/git-reader.ts` reads pinned Git objects and
rejects over 256 issues before batched reads. `core/tasks/metadata.ts` repeats the
count cap before an owned YAML worker. The provider atomically publishes validated
whole snapshots, with byte-bounded caches. These gates—not task polling—are the
scope. The previous automatic-refresh PR113 is already merged and is not redone.

## Assumptions and Failure Modes

Issue data may still be oversized, malformed, duplicated, or inaccessible. Such
data must remain an explicit failure retaining the last good snapshot. Removing
the count check cannot make Git headers overflow an old count-sized allowance;
derive header capacity from selected entries already bounded by tree bytes and
the supported object format. Do not truncate closed issues or paginate silently.
If the actual repo reveals another field violation, report that field precisely
before broadening the repair.

## Plan of Work and Milestones

First add acceptance beyond 256 to the existing contract, Git-reader and provider
tests. Exercise enough short blobs to exceed the former 32-KiB batch-header budget.
Run a focused old-code gate. Then remove only issue count from TASK_LIMITS and its
three consumers; retain input/cache/message and tree byte budgets and all tests
for them. Size batch-check output from selected object IDs plus maximum supported
size text, and batch output from exact validated headers plus blob bytes.

Verify the full provider can load a synthetic >256 backlog, and separately read
the current repository metadata with no writes. Record issue count, total issue
bytes, status and snapshot row count without leaking task descriptions. Update
the living planning note and directly stale reader-limit documentation. Run one
scoped native review; fix any concrete defects, then hand off the clean pushed PR.

## Concrete Steps and Acceptance

From `/home/tedks/Projects/swarm-ide/usability-task-refresh`, run all checks through
Nix/Bazel. The existing `//tools/demo-syntax:editor-tests` accepts test filenames
as `--test_arg` and checks both TypeScript boundaries. Focused inputs are
`tests/task-reader-git.test.ts`, `tests/task-metadata.test.ts`,
`tests/task-provider.test.ts`, `tests/task-contract.test.ts` and the retained
client/attachment cases. Capture exact command, counts and actual-repo proof here.
An old-code >256 rejection must become a complete successful snapshot, while
oversized/invalid data still fails. No hosted or full legacy suite, physical GUI
or provider/model turn.

## Decision Log

Remove the count condition, not raise it. Capacity remains honestly byte/time
bounded. Derive Git framing bytes from actual selected headers, because a fixed
32-KiB allowance would merely replace one invisible count ceiling with another.

## Surprises & Discoveries

Pending direct evidence. ROOT measured 263 issue files / 494312 bytes before
filing the repair; those are not yet this worker's current-repo measurements.

## Outcomes & Retrospective

Pending implementation. The list, attachment and UI APIs remain unchanged.

## Idempotence, Recovery and Artifacts

Use temporary repos for mutations. Never edit actual Ditz YAML manually. Keep
previous branches/history, make an early draft PR, and sync Ditz outcome notes.
Save verification and recap under `/tmp/swarm-ide-task-cap.WoShBY`. Clean only
this worktree's Bazel and any owned temporary proof resources.

## Interfaces and Dependencies

No new dependency, protocol version, provider authority, queue or scheduler.
Existing summary arrays remain validated and whole-response byte bounded.

Initial narrow count-repair plan, 2026-09-08.
