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
- [x] (2026-09-08 15:00Z) Four count regressions RED with134 existing passes before implementation.
- [x] (2026-09-08) Removed count gates and derived Git batch framing bounds from selected tree entries.
- [x] (2026-09-08 15:02Z) First actual read-only Swarm observation:265 issues/497336 bytes/all265 rows,131 closed,330ms;139 initial focused tests/types passed.
- [x] (2026-09-08 15:06Z) Fixed native-review reachability-cache finding; deterministic projection deadline1RED/56PASS, then238 focused tests/seven files plus both types PASS17.061s. Native fix-delta CLEAN.
- [x] (2026-09-08 15:08Z) Corrected-code actual observation:266 issues/498786 bytes/all266 rows,131 closed,230ms; no malformed field violation.
- [x] (2026-09-08) PR116 pushed ready; Ditz accomplishment note synced, proof scratch removed with source/logs preserved in the step directory; ROOT owns normal landing/adoption.

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

Final reproducible focused command:

    nix develop --command bazel test //tools/demo-syntax:editor-tests --jobs=3 --test_arg=tests/task-reader-git.test.ts --test_arg=tests/task-metadata.test.ts --test_arg=tests/task-provider.test.ts --test_arg=tests/task-contract.test.ts --test_arg=tests/task-cache-budget.test.ts --test_arg=tests/task-client.test.ts --test_arg=tests/task-attachment-eligibility.test.ts --test_output=errors

It passed238 tests/seven files and both TypeScript boundaries in17.061s. The
separate one-off current-repository proof ran through the same Bazel target with
`--test_arg=artifacts/task-count-current-proof.test.ts`; its source/output are
preserved under the step directory, not installed as a metadata-dependent test.

## Decision Log

Remove the count condition, not raise it. Capacity remains honestly byte/time
bounded. Derive Git framing bytes from actual selected headers, because a fixed
32-KiB allowance would merely replace one invisible count ceiling with another.
Native review found an old quadratic all-pairs dependency-reachability cache
outside published-cache byte accounting. Keep just one source traversal result
and check the existing deadline in projection and traversal. This bounds retained
state and computation without a new count cap or a graph-platform rewrite.

## Surprises & Discoveries

The actual backlog advanced during independent work: first265 issues/497336 bytes,
later266/498786. Both direct provider reads succeeded with matching pinned revision
and complete row counts. No additional malformed-data limit appeared. The original
four count failures, later deterministic projection timeout failure and corrected
passes are retained separately; no unchanged failure was retried as a fix.

## Outcomes & Retrospective

The reader, parser and schema have no fixed issue-count cap. A700-issue Git/provider
fixture proves batch framing beyond32KiB and retained data on malformed updates;
a300-issue parser case retains150 closed tasks; a400-node cyclic/cross-linked
graph preserves diagnostics. Byte/timeout/shape/path/revision controls remain.
Native initial review found the reachability issue above; scoped correction
converged CLEAN. No GUI/model proof, hosted check or whole legacy suite claimed.
Automatic list refresh and pinned attachment APIs remain unchanged and tested.

## Idempotence, Recovery and Artifacts

Use temporary repos for mutations. Never edit actual Ditz YAML manually. Keep
previous branches/history, make an early draft PR, and sync Ditz outcome notes.
Save verification and recap under `/tmp/swarm-ide-task-cap.WoShBY`. Clean only
this worktree's Bazel and any owned temporary proof resources.

## Interfaces and Dependencies

No new dependency, protocol version, provider authority, queue or scheduler.
Existing summary arrays remain validated and whole-response byte bounded.

Initial narrow count-repair plan, 2026-09-08.
Updated after count regressions, actual repository reads and the native-review
projection correction. ROOT remains responsible for normal landing/adoption.
