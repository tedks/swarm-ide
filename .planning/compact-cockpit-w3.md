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
- [x] (2026-09-06 05:38Z) Implement bounded shell, explicit compact peripheral panels and proportional dock sizing; PR23 initial code a2a3d01 pushed.
- [x] (2026-09-06 05:49Z) Four identity/state regressions and owned-desktop geometry/keyboard journey pass at wide/compact,100%/150%, dock extremes and160% fallback. Long text stress is explicitly DOM-only, not a model transcript.
- [x] (2026-09-06 05:53Z) Native OpenAI and resumed Google council converge CLEAN after fixes through550b30e; Anthropic session-limit error is a missing seat. Aggregatee542a18 includes reviewed I1/A1 and passes24build/all8uncached test targets.
- [ ] Final built-topology/pan screenshots, normal merge transaction, Ditz closure/sync and recoverable handoff; PR23 and ignored evidence record the future merge identity.

## Surprises & Discoveries


The old outer shell enforces a 985–1000 CSS-pixel width and up to 650-pixel
height, while source graphs separately require two 270-pixel columns. At 150%
interface zoom a 1280-pixel window has only about 853 CSS pixels. These minima
therefore overflow even before long labels. The dock's capped pixel slider also
stops changing visible height when all values exceed its viewport cap.

## Decision Log


Use a1100 CSS-pixel compact breakpoint with explicit Work/Information panels in
the middle region; keep both sidebars mounted and source/graphs in their original
order. Council found that the initial overlay prototype could cover keyboard
focus, so the final compact panels take nonoverlapping columns beside navigation.
These are temporary choices in React memory, not configuration or private-text
persistence. Wide layouts retain all panels. A draft-opening gesture reveals Work.

Map the existing230–420 height preference to160px..clamp(180px,40vh,448px), so
both slider extremes remain meaningful and never invert below400px viewport
height. A500 CSS-pixel minimum shell gives a deliberate root scroll fallback in
very short windows. Preserve existing client bounds and callbacks. No new library.

Assumptions: Linux Electron supplies real UI zoom; CSS viewport size is distinct
from native window size and ReactFlow camera zoom. Labels/output are untrusted
literal text and may be extremely long. High zoom, short windows, scroll focus,
open drafts, pending reload guards and existing panned graphs are failure cases,
not reasons to reset state. No provider capability changes are authorized.

## Outcomes & Retrospective


The useful supported desktop target is at least800×500 CSS pixels: at measured
816×510 (1280×800 native request,150% interface zoom and the owned display's DPI),
the maximum204px dock retains94px of source-editor height and113px for each
output/instruction scroll area. At1440×900/100%, measured1377×861, the source is
328px high with max344px dock. Dock minimum160px retains69px output/control areas.
Below the target, measured676×438 at160% uses62px root vertical scrolling; source
remains108px high and close/control focus stays reachable. No outer horizontal
overflow occurred in the measured matrix. Graph navigation has its own bounded
vertical scrolling when both100px surfaces cannot fit together above a max dock.

No source/graph identity, source edits, selection or same-zoom camera position is
discarded on panel toggles and window resizing. Existing GraphPane interface-zoom
changes still deliberately trigger its old fit effect; that separate limitation
is tracked in graph-camera-interface-zoom-reset, not claimed fixed. Mobile-size
touch targets are cockpit-touch-target-size; desktop keyboard/pointer scope is
intentional. Shared display-bound constants remain in the original parent issue.

Production launch remains ADAPTER_POLICY_UNAVAILABLE. Actual unavailable draft
and reload veto are tested independently from explicitly enabled fixture playback.
DOM typography stress is labeled separately from scripted transcript evidence.
No real model turn, authority change or watched master/application adoption.

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
Measure in an owned virtual X11 window through the existing Bazel dev wrapper;
temporary automation belongs to this step, not global tooling. Explicit focus
targets allow keyboard scrolling of output, headings, activity and source status.

## Concrete Steps


Work only in `/home/tedks/Projects/swarm-ide/agent-workbench-compact`.

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel test //tools:quality --jobs=3 --test_output=errors
    nix develop --command bazel build //... --jobs=3
    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test //... --jobs=3 --nocache_test_results --test_output=errors

Use an owned temporary wrapper via Bazel run for compact screenshots and bounded
geometry checks, preserving physical DISPLAY=:0 and app port55173 untouched.

    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel run //tools:dev --jobs=3 --run_under=/tmp/swarm-ide-workbench-w3.kpsE9z/preview-wrapper.sh

The temporary wrapper owns Xvfb/Openbox,55174 and one loopback55175 debug endpoint
only for DOM measurements on the exact owned renderer. It refuses an occupied
debug port, uses the existing X11 ownership checks and releases all owned processes.
The script is archived with sanitized evidence for reproduction; it is not a new
production debug endpoint or a checked-in global harness change.

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

Revision note: initial W3 plan states environment/input assumptions and failure
modes before code. Convergence revision records actual measurements, side-by-side
focus correction, keyboard-scroll targets, separate existing zoom limitation and
review/local gates. Future merge identity belongs to PR23 and the final handoff.
