# Keep idle renderer failures diagnosable and recoverable

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

The user sometimes returns to a hung or black IDE. Preserve the current failing
instance while identifying the failing layer. Deliver a small, verified repair
or a concrete diagnostic/recovery improvement if the historical failure cannot
be reproduced. Never refresh automatically or replay work to make the screen
look healthy.

## Progress

- [x] (2026-09-09 18:32Z) Read repository instructions, plan format and ROOT evidence; verified designated clean branch.
- [x] (2026-09-09 18:35Z) Bounded trace found no historical idle cause; chose missing render-failure containment/diagnostics rather than a guessed idle fix.
- [x] (2026-09-09 18:45Z) Added failure screen, mounted text readers and native event logs; updated living design/maps.
- [x] (2026-09-09 18:44Z) Owned desktop proof passed three hide/show cycles then controlled render failure with exact dirty source, no reload/write/send and cleanup.
- [x] (2026-09-09 18:46Z) Final scoped target passed 27 tests/6 files and both TypeScript boundaries in 15.8 s.
- [x] (2026-09-09 18:49Z) Native fix-delta convergence CLEAN on e1e7940, including runtime, tests, docs/maps and owned proof.
- [x] (2026-09-09 18:51Z) PR147 ready/pushed, Ditz synced; owned GUI resources cleaned and this worktree's Bazel stopped. ROOT owns merge/adoption; original cause issue stays open.

## Surprises & Discoveries

Electron main is alive and its renderer has roughly 2.7 GiB RSS after four hours,
but two short samples do not prove memory growth. The current core did restart.
The existing native window capture is black while the X11 window is hidden, so
it does not independently reproduce a foreground renderer failure. Hardware
acceleration is already disabled. Renderer failure events are not logged and
the React tree has no error boundary.

The initial new focused target failed because its two implementation modules did
not exist (two failed suites, no executed tests). This is not a behavioral RED or
an idle-cause reproduction. The actual controlled desktop failure below proves
the new response to a render exception. Native review found that a second error
during unmount could overwrite the captured text; an instance-owned first snapshot
and a direct cleanup-throws regression correct that. Uncertain local operations
and same-batch native composer text now remain available in the copyable snapshot.

## Decision Log

2026-09-09: Keep the managed process untouched. Diagnose only read-only metadata
and source, then exercise owned disposable processes. No periodic reload,
graphics setting change or observer shutdown without a proven mechanism.

2026-09-09: Add only fixed-category health logs, not arbitrary exception payloads
or URL capture. A React boundary captures in-memory text before cleanup. No
automatic remount/reload is offered: the operator acknowledges copying text before
normal closing/reloading. A process crash or exhausted heap is a distinct case
that cannot rely on this renderer-owned fallback.

## Outcomes & Retrospective

The renderer now has a demonstrated nonblank render-exception fallback and native
health categories, with no work replay. The original reported idle cause remains
unproved. Repeated short hide/show does not stand in for a multi-hour soak.

## Context and Orientation

`app/electron/main.ts` owns the native window and forwards typed requests to
`app/electron/core-supervisor.ts`. `app/renderer/main.tsx` mounts React `App`.
Core loss normally leaves a visible retained shell, not a blank document.
Renderer clients poll data and React components render the shared state.
An error boundary is a React component that can retain an explanatory screen
when a child render throws; it cannot recover a killed Chromium process.

## Plan of Work

`app/electron/window-health.ts` subscribes to native window/contents lifecycle and
fixed renderer console categories; main mounts it and removes it on close.
`app/renderer/renderer-health.ts` installs symmetric global error/rejection
listeners and mount-scoped text readers. `RendererBoundary.tsx` snapshots those
readers once before App cleanup, then shows readonly text and an explicit
close/reload acknowledgement. App contributes unsaved sources across worktrees,
registered drafts and uncertain local operations. TrustedLocalPane contributes
new/ongoing native drafts through synchronous references. No observer scheduling,
core lifecycle, settings or transport command is changed.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/idle-black-screen`. Start Ditz issue
`swarm-idle-black-screen`, commit this plan and open a draft PR. Use
`nix develop --command bazel test --jobs=2 //tools/renderer-health:checks` and
`nix develop --command bazel build --jobs=2 //:desktop-bundle` for checks.
The focused target runs boundary/health and existing new-agent/retention tests,
then both TypeScript configurations. `nix develop --command bazel run --jobs=2
//tools/renderer-health:smoke` owns a disposable Xvfb and real Git fixture; its
test-only renderer imports the production App/Boundary and adds one explicit
fault button. Packaged main/preload/core are unchanged by that fixture. Expected
proof JSON has ok=true, three hide/show cycles, noReload=true, writes=[], errors=[]
and render-error in categories. Cleanup must report cleanup_complete=1.

## Validation and Acceptance

Focused tests must demonstrate the identified failure before the correction,
and successful behavior afterward. Include cleanup/repeated lifecycle checks
and no automatic writes, sends or reloads. An owned Xvfb scenario verifies the
visible behavior with zero unexpected renderer errors. Original idle cause may
remain open; state this explicitly and preserve observed evidence.

## Idempotence and Recovery

All test data and displays are disposable and explicitly owned. Never mutate
the managed profile, current app, external registry or other worktrees. Branch,
worktree and transcripts remain after handoff. ROOT alone merges/adopts.

## Artifacts and Notes

ROOT observations are in `/tmp/swarm-ide-idle-recovery.FmqOMe/root-evidence.md`.
Keep concise progress, verification and final recap in that same directory.

First actual proof: `/tmp/renderer-health.mfy99k/proof.json`, elapsed 1,721 ms;
native log recorded render-error at 2026-09-09T18:44:13.839Z, core generation 1.
`recovery-text.png` visually inspected: readable fallback and retained dirty source.
There were zero unexpected renderer errors and zero write/agent-send calls.
The desktop assertion establishes dirty-source marker retention, not a bytewise
comparison of the entire source buffer. Unit tests compare exact retained values.
Remaining original-cause investigation is tracked as `swarm-idle-black-screen-cause`.

## Interfaces and Dependencies

Use existing Electron, React and typed bridge dependencies. Do not introduce a
monitoring subsystem. Any new runtime source receives a design document and
actual Bazel input mapping in `.swarm/plans.json`.

Updated 2026-09-09 after concrete containment/diagnostic implementation and first
proof. Original idle failure remains open rather than attributed to the test fault.
