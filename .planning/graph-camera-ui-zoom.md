# Preserve deliberate graph cameras through interface zoom

This ExecPlan is maintained under `.planning/PLANS.md`. Its progress and decisions are updated as verification proceeds.

## Purpose / Big Picture

Users can enlarge the interface without losing their place in either repository or service graph. Interface zoom changes the size of the entire Electron interface; graph zoom changes the magnification of the graph scene alone. After deliberately panning and zooming both graphs, changing interface zoom from 100% to 150% and back must not invoke Fit or overwrite either camera.

## Progress

- [x] (2026-09-06 06:40Z) Inspected the exact GraphPane cause and W3 measurements; created designated isolated worktree from reviewed e2f3da7.
- [x] (2026-09-06 06:43Z) Proved all four targeted regressions red against unchanged GraphPane (554 existing tests passed); removed only the offending effect and unused ref/imports.
- [x] (2026-09-06 06:48Z) Verified actual deliberate cameras/source/instances in owned X11: first scenario78.327s, cleanup1. Full24-target build/all8 uncached tests passed,558tests/49files; code review available-seat fixpoint CLEAN.
- [x] (2026-09-06 07:04Z) Frozen I2 aggregate passed full25/all9/562tests50files; actual first source-mount proof85.907s and final clearer left/up-pan proof89.695s each passed with cleanup1. Inspected wide/high-zoom screenshots.
- [ ] Repeat final local gates after normally merging reviewed P4 PR26 and using actual percent units in the test props; product GraphPane bytes are unchanged.
- [ ] Complete provider-diverse council to fixpoint, normal PR landing, issue synchronization and owned-process cleanup.

## Surprises & Discoveries

GraphPane explicitly schedules two animation frames after every non-null interfaceZoom change and then calls the ReactFlow instance's fitView. That operation is unrelated to ordinary container resize and is the evidenced reset cause. A gesture after the first frame can also be overwritten by the second. ReactFlow already owns each mounted graph's camera, initialization and explicit Fit controls.

The installed ReactFlow12.11.6 source confirms ordinary resize updates its width/height without fitting. A stable fitView=true prop does not requeue a fit on rerenders; initial fitting and Controls do not require GraphPane's onInit callback. The existing service projection begins empty and correctly performs its initial fit when the real topology build first supplies nodes, as observed in X11.

The first visual proof preserved exact cameras but began its deliberate gestures from a camera fitted before source navigation narrowed the panes, leaving parts of the scene offscreen at150%. That is consistent with the invariant, but weak visual communication. The final temporary proof explicitly Fits the source-open layout first, then makes real pan and graph-zoom gestures; it does not manufacture camera state or change product behavior.

An aggregate smoke was invalidated by this child's own plan edit/commit while topology was building. The actual owned title reported Topology3:yellow, and the expected consistent-state wait timed out; cleanup completed. The worktree was then frozen and all9 tests passed, including the real topology smoke in68.2s. Keep even documentation commits outside these tests: working-world fingerprints intentionally include Git status/commit, not just compiled code. No product or harness bypass was made.

Native evidence review caught a false distinction between mounting source and reopening an already-open source after service selection. The corrected scenario asserts the editor is absent, actually pans and wheel-zooms both graphs, opens source via command-palette input, and checks identical camera observations with the editor now mounted. It then retains editor identities for subsequent tests. A final repeat pans up/left to keep scene content visible through the smaller150% viewport. All earlier runs and their narrower claims remain identified in the evidence.

## Decision Log

The invariant is exact preservation of each library-owned camera triple `{x, y, zoom}` in CSS coordinates relative to its graph pane. No anchor correction is necessary: interface zoom magnifies those CSS coordinates together with the rest of the interface. The visible extent can change with layout; preserving the camera does not promise that every formerly visible node remains visible. This avoids introducing a second camera state or parsing DOM transform strings in production. Date/author: 2026-09-06, W4.

Remove the interface-zoom-driven imperative fit and its now-unused instance ref, retaining the existing typed prop for compatibility with the parent. Preserve ReactFlow's initial fit, padding/maxZoom, explicit Controls and selection callbacks. There will be no W4 asynchronous camera callback to become stale through hidden panes, rapid zoom or a later gesture. No new camera input or validation surface is introduced. Date/author: 2026-09-06, W4.

## Outcomes & Retrospective

The minimal removal fixed all four failing orchestration regressions, and actual owned X11 input confirmed independent deliberate cameras through interface zoom, compact panes, rapid resize, first source mount and unsaved source work. Initial Fit, explicit Fit and source/service focus mapping remain available. Unit tests establish only application orchestration; the actual X11 proof establishes library/editor behavior. A smaller viewport can still crop a deliberately positioned scene; exact camera continuity is not automatic recentering or a promise to keep all nodes visible. No cross-session camera persistence or new configuration is added. Final reviewed-upstream aggregate landing remains in progress. No real agent or policy capability is involved.

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

Exact temporary invocation:

    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel run //tools:dev --jobs=3 --run_under=/tmp/swarm-ide-graph-camera-w4.OofLMn/camera-preview-wrapper.sh

Reproduction scripts are retained in the ignored evidence directory's `reproduce/` folder. The scenario uses only ownership-checked X11 input for clicks, wheel, keyboard and native resize. Loopback CDP reads DOM transforms/dimensions and retains DOM object handles for identity comparison; it never invokes camera APIs or mutates application/DOM state.

## Validation and Acceptance

Before the fix the new deliberate-camera/late-frame tests must fail because GraphPane calls fitView. After the fix they must pass without changing their assertions. The virtual proof must record non-default pan and graph zoom for each graph before and after a 100→150→100 interface-zoom roundtrip and compact pane/source interaction. Compare exact viewport transforms only as test observations, preserve DOM identities and unsaved source contents, and show that explicit Fit still changes the deliberate camera. Record CSS viewport dimensions and screenshots. Full Bazel build and all actual local tests are required separately from review. Hosted CI status must be reported as observed, never inferred from local success.

## Idempotence and Recovery

Keep this isolated feature worktree and granular pushed commits. Retry owned virtual checks through the harness's existing PID-scoped cleanup, never by killing a port or deleting shared locks. The temporary proof changes only unsaved source in its disposable app. No watched master adoption is permitted; ROOT owns later integration and retirement. If a shared file correction is needed, request an exact ownership exception before editing.

## Artifacts and Notes

Concise seam: `/tmp/swarm-ide-graph-camera-w4.OofLMn/seam.md`. Sanitized evidence and final handoff: `master/artifacts/overnight-wave/graph-camera-w4/`. Existing issue `graph-camera-interface-zoom-reset` is closed only after actual proof and landing; unrelated touch-size/shared-layout followups remain open.

## Interfaces and Dependencies

Keep ReactFlow and all existing prop/callback contracts unchanged. Add no package, helper or generalized camera state management. W4 owns only GraphPane, this plan and the focused new test. Actual graph rendering depends on the pinned @xyflow/react installation; its initial fitting and explicit controls are exercised in the virtual acceptance, not reimplemented.

Revision note: Initial plan states the invariant and failure modes before product code changes.

Revision note2026-09-06: Recorded four red regressions, first green/local/actual-X11 evidence, source-backed initialization behavior, available-seat CLEAN review and the reason for improving the visibly framed acceptance baseline. Aggregate landing is explicitly still pending.

Revision note2026-09-06 07:04Z: Recorded the contaminated smoke and frozen rerun, source-mount evidence correction, final visible-pan acceptance, honest viewport limitations and reviewed P4 aggregate gate. Test props now use100/125/150 percent units like App rather than normalized factors; camera values remain graph zoom, not interface zoom. Only the final aggregate and normal landing/cleanup checkboxes remain open.
