# Preserve deliberate graph cameras through interface zoom

This ExecPlan is maintained under `.planning/PLANS.md`. Its progress and decisions are updated as verification proceeds.

## Purpose / Big Picture

Users can enlarge the interface without losing their place in either repository or service graph. Interface zoom changes the size of the entire Electron interface; graph zoom changes the magnification of the graph scene alone. After deliberately panning and zooming both graphs, changing interface zoom from 100% to 150% and back must not invoke Fit or overwrite either camera.

## Progress

- [x] (2026-09-06 06:40Z) Inspected the exact GraphPane cause and W3 measurements; created designated isolated worktree from reviewed e2f3da7.
- [x] (2026-09-06 06:43Z) Proved all four targeted regressions red against unchanged GraphPane (554 existing tests passed); removed only the offending effect and unused ref/imports.
- [ ] Verify actual deliberate cameras, source state and mounted instances in the owned virtual desktop; run full local gates.
- [ ] Complete provider-diverse council to fixpoint, normal PR landing, issue synchronization and owned-process cleanup.

## Surprises & Discoveries

GraphPane explicitly schedules two animation frames after every non-null interfaceZoom change and then calls the ReactFlow instance's fitView. That operation is unrelated to ordinary container resize and is the evidenced reset cause. A gesture after the first frame can also be overwritten by the second. ReactFlow already owns each mounted graph's camera, initialization and explicit Fit controls.

## Decision Log

The invariant is exact preservation of each library-owned camera triple `{x, y, zoom}` in CSS coordinates relative to its graph pane. No anchor correction is necessary: interface zoom magnifies those CSS coordinates together with the rest of the interface. The visible extent can change with layout; preserving the camera does not promise that every formerly visible node remains visible. This avoids introducing a second camera state or parsing DOM transform strings in production. Date/author: 2026-09-06, W4.

Remove the interface-zoom-driven imperative fit and its now-unused instance ref, retaining the existing typed prop for compatibility with the parent. Preserve ReactFlow's initial fit, padding/maxZoom, explicit Controls and selection callbacks. There will be no W4 asynchronous camera callback to become stale through hidden panes, rapid zoom or a later gesture. No new camera input or validation surface is introduced. Date/author: 2026-09-06, W4.

## Outcomes & Retrospective

Work is in progress. Unit camera ownership assertions alone are not evidence of real ReactFlow behavior; actual owned X11 input and DOM measurements must confirm the library behaves as expected. No real agent or policy capability is involved.

## Context and Orientation

`app/renderer/GraphPane.tsx` adapts repository/service projections into independently mounted ReactFlow graphs and forwards node/edge selections into the shared focus model. It currently retains an instance solely for an effect keyed to interfaceZoom. `tests/graph-camera.test.tsx` is a new focused orchestration test: a camera-owning library fake detects unwanted imperative fitting and instance replacement; it does not claim to implement or test ReactFlow internals. Existing graph selection tests remain unchanged. W3's compact layout and App composition are outside this step's ownership.

Assume valid graph data from the existing validated bridge and Electron interface zoom from the existing controls. The fix accepts no external camera values; therefore nonfinite camera validation belongs to existing library boundaries, not a new W4 parser. Failure cases include zoom/resize interleaving, zero-size hidden panes becoming visible, late animation frames overwriting a newer pan, accidental shared camera state and component remounts. Legitimate node selection and explicit Fit must still function.

## Plan of Work

First add the isolated test and demonstrate failure against unchanged GraphPane using the Bazel quality target. Then remove the effect and unused ref/imports without changing parent props, layout, source lifetime, bridge, library options or graph mapping. Run the same tests to green. A temporary acceptance wrapper uses the existing virtual desktop harness through Bazel, with loopback DOM observation and actual owned X11 input, to pan and graph-zoom both real built topology projections, change existing interface zoom controls, and preserve unsaved source/graph instances. Finally obtain council reviews, fix all actionable findings, run local build/all tests and normal-merge the PR under the explicit local-verification remote-CI waiver.

## Concrete Steps

Run from `/home/tedks/Projects/swarm-ide/graph-camera-zoom`:

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel test //tools:quality --jobs=3 --nocache_test_results --test_output=errors
    nix develop --command bazel build //... --jobs=3
    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test //... --jobs=3 --nocache_test_results --test_output=errors

The temporary owned proof is executed through `bazel run //tools:dev --run_under=<archived wrapper>` under the same lock. Only ports 55174 and optional measurement 55175 are used; actual desktop DISPLAY=:0, watched 55173 and unrelated 5173 are excluded.

## Validation and Acceptance

Before the fix the new deliberate-camera/late-frame tests must fail because GraphPane calls fitView. After the fix they must pass without changing their assertions. The virtual proof must record non-default pan and graph zoom for each graph before and after a 100→150→100 interface-zoom roundtrip and compact pane/source interaction. Compare exact viewport transforms only as test observations, preserve DOM identities and unsaved source contents, and show that explicit Fit still changes the deliberate camera. Record CSS viewport dimensions and screenshots. Full Bazel build and all actual local tests are required separately from review. Hosted CI status must be reported as observed, never inferred from local success.

## Idempotence and Recovery

Keep this isolated feature worktree and granular pushed commits. Retry owned virtual checks through the harness's existing PID-scoped cleanup, never by killing a port or deleting shared locks. The temporary proof changes only unsaved source in its disposable app. No watched master adoption is permitted; ROOT owns later integration and retirement. If a shared file correction is needed, request an exact ownership exception before editing.

## Artifacts and Notes

Concise seam: `/tmp/swarm-ide-graph-camera-w4.OofLMn/seam.md`. Sanitized evidence and final handoff: `master/artifacts/overnight-wave/graph-camera-w4/`. Existing issue `graph-camera-interface-zoom-reset` is closed only after actual proof and landing; unrelated touch-size/shared-layout followups remain open.

## Interfaces and Dependencies

Keep ReactFlow and all existing prop/callback contracts unchanged. Add no package, helper or generalized camera state management. W4 owns only GraphPane, this plan and the focused new test. Actual graph rendering depends on the pinned @xyflow/react installation; its initial fitting and explicit controls are exercised in the virtual acceptance, not reimplemented.

Revision note: Initial plan states the invariant and failure modes before product code changes.
