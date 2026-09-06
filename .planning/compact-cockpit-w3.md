# Keep the cockpit usable in compact windows

This living ExecPlan follows `.planning/PLANS.md`. W3 is presentation only; the
shared agent execution plan and authority contracts are unchanged.

## Purpose / Big Picture


Keep source, repository/service navigation and agent controls reachable at high
interface zoom. A compact window deliberately tucks peripheral Work and Information
panels behind labeled buttons, without destroying their content or moving focus
in the software world. Output and controls scroll inside bounded regions rather
than stretching the whole desktop beyond its window.

## Progress


- [x] (2026-09-06) Read product/contracts, instructions and prior screenshots; create designated branch from reviewed PR19 merge 2cbea945.
- [ ] Implement bounded shell, compact peripheral panels and proportional dock sizing.
- [ ] Add identity/state regressions and measure real owned-desktop rectangles and keyboard access at wide/compact, 100%/150%, and dock extremes.
- [ ] Complete local build/tests, provider-diverse review to fixpoint, normal PR merge, Ditz and recoverable handoff.

## Surprises & Discoveries


The old outer shell enforces a 985–1000 CSS-pixel width and up to 650-pixel
height, while source graphs separately require two 270-pixel columns. At 150%
interface zoom a 1280-pixel window has only about 853 CSS pixels. These minima
therefore overflow even before long labels. The dock's capped pixel slider also
stops changing visible height when all values exceed its viewport cap.

## Decision Log


Use a 1100 CSS-pixel compact breakpoint with explicit, nonmodal Work/Information
drawers in the middle region; keep both sidebars mounted and source/graphs in
their original order. These are temporary presentation choices in React memory,
not configuration or private-text persistence. Wide layouts retain all panels.

Map the existing bounded height preference to a proportional usable viewport
range, so both slider extremes remain meaningful after window resizing. Preserve
existing client bounds and callbacks. Do not add a new layout library.

Assumptions: Linux Electron supplies real UI zoom; CSS viewport size is distinct
from native window size and ReactFlow camera zoom. Labels/output are untrusted
literal text and may be extremely long. High zoom, short windows, scroll focus,
open drafts, pending reload guards and existing panned graphs are failure cases,
not reasons to reset state. No provider capability changes are authorized.

## Outcomes & Retrospective


Pending actual implementation and evidence. Existing production launch remains
ADAPTER_POLICY_UNAVAILABLE. Fixture presentation is not live model evidence.

## Context and Orientation


`app/renderer/App.tsx` composes the work rail, navigation/source, contextual
instruments and activity/run dock. `styles.css` owns the shell; `agents/agents.css`
owns run/draft presentation. `RunPane.tsx` is explicitly enabled fixture rehearsal;
`LiveRunPane.tsx` consumes the actual typed bridge. Both retain existing controls.
GraphPane and EditorPane must not acquire new keys or conditional replacements.
The existing source and agent reload guards remain the sole authority for refresh.

## Plan of Work


Remove conflicting intrinsic shell minima, bound overflow at panel content
boundaries, wrap long readable information, and make the compact sidebars explicit.
Keep the navigation region large enough to use source while exposing both graph
surfaces. Add topbar toggles with aria-controls/expanded and automatically reveal
Work only on an explicit draft opening. Keep all command and title names unchanged.
Measure before/after in an owned virtual X11 window through the existing Bazel
dev wrapper; any temporary automation belongs to this step, not global tooling.

## Concrete Steps


Work only in `/home/tedks/Projects/swarm-ide/agent-workbench-compact`.

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel test //tools:quality --jobs=3 --test_output=errors
    nix develop --command bazel build //... --jobs=3
    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test //... --jobs=3 --nocache_test_results --test_output=errors

Use an owned temporary wrapper via Bazel run for compact screenshots and bounded
geometry checks, preserving physical DISPLAY=:0 and app port55173 untouched.

## Validation and Acceptance


Observe wide and compact windows at 100% and150% interface zoom, not graph zoom.
Exercise dock closed/open/min/max, long output and paths, draft, protected reload,
source edits, panel toggles, resizing and keyboard instructions/Stop/source return.
Record viewport and panel rectangles; require no accidental outer horizontal
overflow, readable source viewport, reachable primary controls and retained DOM
identities/cameras. Below the supported viewport, bounded scrolling must keep
controls accessible rather than silently clipping them. Exact support and limits
will be recorded from measurements, not assumed from jsdom tests.

## Idempotence and Recovery


No source migration or persisted setting changes. Tests own their windows/processes
and release the shared virtual lock (flock --close) and exact resources. Preserve
clean pushed feature worktree for integration; never update watched master/app.

## Artifacts and Notes


Sanitized logs/screenshots/viewport measurements and exact tested head/tree go to
`master/artifacts/overnight-wave/workbench-w3/handoff.md`. The task-specific Ditz
issue is agent-workbench-compact-layout-w3; its parent retains separate shared
display-bound and later layout scope. Review/CI limitations must be explicit.

## Interfaces and Dependencies


Existing React, CSS Grid/Flex, CodeMirror and ReactFlow only. Compact toggles use
`data-compact-panel`, `aria-controls` and existing mounted panel IDs. Dock preference
remains the existing bounded 230–420 value; presentation maps it to available space.
No protocol, core, bridge-client, reload mutation, Electron or harness ownership moves.

Revision note: initial W3 plan states environment/input assumptions and concrete
failure modes before code; final measurements will refine support thresholds.
