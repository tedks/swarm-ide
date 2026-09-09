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
- [ ] Trace renderer lifetime and identify a reproducible failure class.
- [ ] Add focused regression and smallest correction; update living design.
- [ ] Run scoped tests, native fix-delta review and one owned desktop proof.
- [ ] Push ready PR, record actual limits and Ditz accomplishments, clean owned resources.

## Surprises & Discoveries

Electron main is alive and its renderer has roughly 2.7 GiB RSS after four hours,
but two short samples do not prove memory growth. The current core did restart.
The existing native window capture is black while the X11 window is hidden, so
it does not independently reproduce a foreground renderer failure. Hardware
acceleration is already disabled. Renderer failure events are not logged and
the React tree has no error boundary.

## Decision Log

2026-09-09: Keep the managed process untouched. Diagnose only read-only metadata
and source, then exercise owned disposable processes. No periodic reload,
graphics setting change or observer shutdown without a proven mechanism.

## Outcomes & Retrospective

Investigation is in progress. The historical cause is unproved.

## Context and Orientation

`app/electron/main.ts` owns the native window and forwards typed requests to
`app/electron/core-supervisor.ts`. `app/renderer/main.tsx` mounts React `App`.
Core loss normally leaves a visible retained shell, not a blank document.
Renderer clients poll data and React components render the shared state.
An error boundary is a React component that can retain an explanatory screen
when a child render throws; it cannot recover a killed Chromium process.

## Plan of Work

First inspect recurring subscriptions and state retention and record what is
actually demonstrated. If a small concrete defect is found, reproduce it before
correction. Otherwise add narrowly scoped renderer failure reporting and a
non-destructive failure surface, with explicit user-controlled recovery only
where retained buffers are safe. Update this plan with exact scope before code.
Do not conflate diagnostics or simulated failures with a historical idle fix.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/idle-black-screen`. Start Ditz issue
`swarm-idle-black-screen`, commit this plan and open a draft PR. Use
`nix develop --command bazel test --jobs=2 <focused target>` and
`nix develop --command bazel build --jobs=2 //:desktop-bundle` for checks.
New focused target and actual owned desktop command will be recorded here once
the concrete mechanism is selected. No direct Vitest/Electron invocation.

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

## Interfaces and Dependencies

Use existing Electron, React and typed bridge dependencies. Do not introduce a
monitoring subsystem. Any new runtime source receives a design document and
actual Bazel input mapping in `.swarm/plans.json`.

Initial plan recorded 2026-09-09 before implementation; update it when the
investigation selects a concrete repair.
