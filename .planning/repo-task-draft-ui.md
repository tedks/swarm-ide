# Attach a pinned task without retargeting source

This ExecPlan is maintained under `.planning/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current.

## Purpose / Big Picture


D5 adds a deliberate task-to-draft interaction. A person inspecting an authoritative Ditz detail can review a single read-only task attachment beside editable instructions. The draft's disk source stays fixed independently of task attention. This consumer runs against the verified D3 base, which deliberately rejects attached Prepare with UNSUPPORTED_CONTROL; successful joined preparation is D6 after ROOT verifies D4.

## Progress


- [x] (2026-09-07) Read ROOT authority, accepted product contract, full parent plan and D3 intake/handoff; verified designated clean feature/task-draft-ui at 6e11ce42.
- [x] (2026-09-07 10:38Z) UI baseline: four mounted failures (missing review, attached-empty Prepare disabled, legacy label absent), 1,396 passed. Client/selector were already implemented and their green tests are not historical RED. A mechanical test-type adapter removal overlapped baseline startup; this is not final frozen-head attribution.
- [x] (2026-09-07 10:46Z) Current-detail selector, source-independent generation-bound proposal, one-slot form, explicit original history and narrow ROOT-approved dock reveal implemented. Quality1 passed 1,400 tests/100 files; scoped packaged driver was authored alongside, not yet executed.
- [x] (2026-09-07 10:52Z) Frozen bd9eb84 build34 PASS56.170s and all13 fresh local suites PASS260.734s, quality1403/100. Actual CLI-Ditz packaged attachment journey passed9.1s with cleanup1/zero renderer errors at100/150 compact, retaining source/cursor/cameras through each intentional instruction edit. Google full review CLEAN; native found one held-launch retirement race; Anthropic timed out420s without review, unavailable.
- [x] (2026-09-07 15:25Z) Resumed same D5 after user quota replenishment; preserved existing work and completed evidence. Exact held-launch regression RED1/1403PASS before narrow existing closeDraft retirement correction. Screenshot-only additions expose the actual review/slot in the existing dock, without changing layout or old assertions. Corrected frozen gates/convergence pending.
- [ ] Prove actual owned virtual interaction, strict local full suite and provider-aware council convergence.
- [ ] Push and normally land only on ROOT-cleared base; hand off D4/D6 limits.

## Surprises & Discoveries


The existing dock has independent agent, run and mock-conversation tabs; merely opening an existing draft does not reveal its tab. Attachment must deliberately reveal the draft without changing source/task documents. The existing task client owns a single ref-check timer; attachment adds no timer or scan.

Native review found a specific asynchronous retirement path missed by the first tests: launch acknowledgement cleared a prepared draft without invalidating its pending attachment proposal. The new held-response regression demonstrates resurrection of retired instructions with a reset model (1 RED, 1,403 pass). Reusing existing closeDraft invalidates preparation, edit generation and proposal together while preserving the existing runId guard that protects newer drafts. This is a controlled schema-fixture race, not a historical production/model incident.

## Decision Log


Decision (2026-09-07, D5): a pending attachment is a proposal, not a new draft. Cancel leaves even an in-flight preparation untouched. Acceptance checks the agent lifetime, edit generation, current task observation and, for a new draft only, independent source authority. Navigation cannot invalidate or retarget an already-fixed draft by itself.

Decision (2026-09-07, D5): keep preview text outside the wire request. Use D3's pure canonical formatter to count the exact combined task envelope; only the reference goes to the core. Neither previews nor fixture responses attest real provider execution.

## Outcomes & Retrospective


Implementation and verification are pending. Production policy stays unavailable. Human canvas55175, master/shared integration and existing user buffers are untouched.

## Context and Orientation


`app/renderer/agents/bridge-client.ts` owns draft text, fixed FocusRef, prepare tickets and uncertain receipts. `live-state.ts` is its retained memory shape. `PreparedLaunchDraft.tsx` renders the form and `LaunchContextView.tsx` renders immutable prepared/history evidence. `tasks/client.ts` correlates local metadata observations and selected details; an eligible candidate must be connected, observed, idle and exactly pinned by repository/world/full ID/commit/blob. `TaskDetail.tsx` is shared by task documents and Context. Only the task-to-draft composition in `App.tsx` changes. Shared protocol/core/store interfaces stay frozen.

## Plan of Work


First add tests that exercise actual client lifetimes and mounted controls. Add a readonly candidate selector with a revalidation closure. Add a transient proposal to the agent client, one optional taskReference plus cached readonly preview to LaunchForm, and generation guards. Review offers append preserving every character, replace clearing instructions, and inert cancel. A duplicate full pin is a no-op; newer commits require review. Removal keeps source/model/text. Recovering memory retains intent but drops preparation and preview eligibility. Render full pin, disk-only source and escaped readonly metadata with explicit core-verifies-at-Prepare wording. Wire the shared detail button to independently selected source without navigation or task mutation. Extend only scoped presentation and relevant tests.

## Concrete Steps


Work only in `/home/tedks/Projects/swarm-ide/task-draft-ui` on `feature/task-draft-ui`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Run `nix develop --command bazel test //:quality --jobs=3 --nocache_test_results`, then frozen `nix develop --command bazel build //... --jobs=3` and `flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test //... --jobs=3 --nocache_test_results`. All GUI proof uses that same lock and owned X11, never inherited physical display. Preserve raw logs under `/tmp/swarm-ide-task-consumers.jbWXBA/ui`.

## Validation and Acceptance


Show exact append/replace/cancel/remove, duplicate/new revision, stale task/source/client proposal refusal, late Prepare invalidation, Unicode/escaping byte boundaries, and history preserving original materialization. A task cannot choose a linked file; dirty source/cursor and graph instances/cameras persist. Actual D3 attached Prepare displays UNSUPPORTED_CONTROL; successful prepared/history UI uses explicitly labelled schema-valid fixtures only. Run full local gates and council to clean fixpoint, noting unavailable foreign seats. Request exact ownership before extending a packaged proof driver. No ignored renderer exceptions or unexplained retries.

## Idempotence and Recovery


Use deterministic Ditz issue repo-task-draft-ui-d5; keep parent repo-task-draft-provenance open. No commands replay on recovery. No local user metadata changes except issue tracking through Ditz CLI. Preserve worktree/branch/session/evidence. If master advances, seek ROOT clearance before consumption; never automatically merge the core peer. Preserve failures and report a held gate rather than manufacture success.

## Artifacts and Notes


ROOT authority: `/tmp/swarm-ide-task-consumers.jbWXBA/common.md`. Verified base receipt: `/tmp/swarm-ide-task-draft-d3.ymHzPV/root-verification.md`. Accepted contract is `docs/repo-task-draft.md`; parent `.planning/repo-task-draft.md` is frozen. This plan owns only D5's outcome.

## Interfaces and Dependencies


Reuse React, the typed bridge and pure `protocol/agent-task.ts` formatter/reference types. No dependency or protocol change. Task candidate validity and proposal validity are local observation guards, not a frozen Git/filesystem promise. Core independently revalidates pins; D4 owns that implementation, D6 owns reviewed joined acceptance. Production remains ADAPTER_POLICY_UNAVAILABLE.

Revision note (2026-09-07): initialized bounded UI consumer plan before implementation; no delivery claim.
