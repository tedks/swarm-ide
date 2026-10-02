# Resolve the refactoring audit without weakening ownership

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Make source replies trustworthy, restore useful regression gates, simplify document navigation, and bound background observation. Existing agent modes, retained drafts/buffers, graph semantics and no-replay behavior stay intact. Performance changes require evidence, not a new framework.

## Progress

- [x] 2026-10-02: audited baseline 6eb9af0507fae028e93375e30e70c96a4effdac6; user authorized implementation of all findings.
- [x] Correlate file responses and consistently exclude unrelated result fields; PR160/163 merged.
- [x] Repair shared UI fixture identity/envelopes and stale test entry points (121 tests across nine affected suites passed; available-seat council clean).
- [x] Declare actual test inputs and runner ownership; runfile assertion and cache-mutation probes verified, available-seat council clean.
- [ ] Type document identity and extract navigation transitions while retaining editor state.
- [ ] Make fingerprint work cancellable and safe against FIFO replacement.
- [ ] Measure and suspend inactive worktree observations without discarding accepted work.
- [ ] Remove unreachable UI glue and unused helpers; align living design.
- [ ] Measure gate/packaging and snapshot overhead; implement justified narrow changes.
- [x] Controller completed W10 reconciliation independently; preserve that ownership.
- [ ] Resolve external-write preservation design or record the precise remaining product decision.
- [ ] Complete local gates, council convergence, branch pushes and reviewable PRs.

## Surprises & Discoveries

Initial host assessment: 12 GiB available RAM on a 125 GiB host, swap almost full. Serialize gates with one Bazel job and one Vitest worker; do not start desktop suites until resources permit. Disk has ample space. Fresh worktree requires frozen dependency installation.

## Decision Log

2026-10-02: Use sequential bounded commits and logical PRs, starting with contracts. Audit-only authority ended when Ted requested fixes. Keep the private audit unchanged as baseline evidence. Do not conflate historical limited-agent policy work with current trusted execution or delete that feature track. Do not add CI. Measure before narrowing build inputs or wire responses.

## Outcomes & Retrospective

Contract regressions fail on the baseline. The expanded contract gate passes after the fix and task-contract fixture alignment: eight suites, 234 tests, both TypeScript boundaries. W1 merged as PR #160 after integrating editor history PR #161 and rerunning the contract gate. Optional undefined-result compatibility corrected in PR #163 with a failing regression and 102 passing tests; available-seat convergence clean. W2 baseline was 36 failed/8 passed; explicit workspace/task fixtures and current UI entry points pass all 44 original cases plus two contract tests. Two adjacent planning suites also needed explicit identity composition and automatic-read expectations with held replacement reads. Expanded current-composition gate passes 121 tests, including editor history, plus both TypeScript checks. Native/Google W2 convergence is clean; Anthropic remains unavailable. W2 merged as PR162. W3 declares design documents and mapped BUILD/source inputs for all five callers, verifies their runfile availability and separates the two tools-owned Vitest suites from five node:test suites. Doc-only and BUILD-text-only mutation probes each invalidated cached success and failed as intended, with exact restoration. Final living-design gate: 102 tests and both TypeScript boundaries passed; response gate passed; Node owners CLI (52), supervisor (33), container (10) passed. Vitest ownership probe excluded Node suites, and retained tool suites passed (three registration cases intentionally skip without the bundled CLI). Native review caught an undeclared container document; added it and both available seats converged clean. W4–W9 remain.

## Context and Orientation

`protocol/schema.ts` validates typed core requests/replies; Electron main/preload and renderer clients use it. `app/renderer/App.tsx` currently coordinates documents with strings and multiple visibility flags. `core/workspace-context.ts` owns immutable per-root runtimes, while `core/worker-runtime.ts` starts their observers. `core/fingerprint.ts` hashes Git and changed-file contents. `fixtures/world.ts` and `fixtures/tasks.ts` currently disagree on repository identity. Root `BUILD.bazel` uses a broad quality filegroup; tools scripts define gates. Component contracts live in `docs/design/` and `.swarm/plans.json`.

The audit identified nine findings: missing file path/result correlation; invalid combined fixtures; undeclared test inputs; document sentinel collision and repeated transitions; uncancelled fingerprint I/O; retained idle observers; unreachable browser/rail glue; repeated gate/package cost; universal snapshot overhead. Existing `atomic-source-write-broker` separately describes the check-to-rename external writer race.

## Plan of Work

First add failing contract cases for missing/wrong file replies and unsolicited payloads, then implement correlation centrally without changing domain semantics. Repair fixtures by deriving identities from one explicit workspace and stamping scoped envelopes. Declare docs/build-file inputs of design tests and separate Vitest from node:test ownership.

Next replace ambiguous document identity and centralize transitions while keeping file buffers and CodeMirror memories mounted independently. Remove the unreachable old worktree browser mount; preserve the broker used by ordinary worktree selection. Make fingerprint subprocess/file work have cancellation and nonblocking descriptor ownership before suspending idle read observers. Measurements decide the scope of packaging and response-envelope changes. Backlog closure requires direct current evidence; root-cause-unknown incidents stay open.

## Concrete Steps

Work in the designated refactor-cleanup worktree on feature branches. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Use `nix develop --command bazel --host_jvm_args=-Xmx512m test --jobs=1 --local_resources=memory=2048 //tools/demo-syntax:editor-tests --test_arg=<test-file> --test_arg=--maxWorkers=1` for focused tests and TypeScript boundaries. The existing script accepts explicit file arguments. Record actual commands and outcomes below. Broaden only after relevant focused gates pass, and keep source fixed during each gate.

## Validation and Acceptance

A response for B cannot populate A; valid same-file replies still succeed. Mounted task tests reach their retention assertions with valid identities and reject deliberately wrong identities. Tests rerun when documents/build definitions they inspect change. A file literally named graphs opens/closes/restores distinctly from overview. Cancelling/disposing a fingerprint drains its owned process and cannot publish late success. Inactive observers stop scheduling while accepted writes/builds retain their original roots. Dead mounts disappear without removing current navigation. Performance decisions include before/after measurements. No gate is claimed unless run at the recorded commit.

Regression tests pinning fixes must fail with the fix reverted. PRs use normal merges only after local exact-head gates and council fixpoint; no public private-audit text or session metadata in source.

## Idempotence and Recovery

Granular commits allow ordinary revert. Do not delete shared scratch, worktrees, processes or caches. Cancel only owned gates. Ditz edits use CLI and deterministic issue IDs. Preserve dirty operator buffers and uncertain mutation receipts; automatic recovery never replays mutation requests.

## Artifacts and Notes

Parent tracker: `swarm-astra-cleanup-20261002`. Per-package gate receipts and review outcomes will be added here. No baseline test pass is inferred from the audit.

## Interfaces and Dependencies

Use existing Zod schemas, React state/hooks, Node descriptor/process APIs and Nix/Bazel entry points. No new library is presently required. File correlation compares request path and result path exactly; document identities distinguish files from nonfile surfaces; cancellation must own and drain underlying work rather than abandon promises.

Coordination: implementation stays solo; provider-diverse review council is authorized. Controller owns W10 tracker reconciliation and editor-undo-history-20260907 in separate worktrees. Astra retains W1–W9; dispatch-lineage and agy adapter remain deferred. External source-write policy remains a user decision.

Initial plan created 2026-10-02 following implementation authorization.

2026-10-02 W3: Declare actual reader inputs rather than claim full JavaScript hermeticity. The existing runners still execute from the checkout; the design consistency assertion specifically checks Bazel runfiles to prevent undeclared reads from hiding.
