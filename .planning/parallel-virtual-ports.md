# Independent packaged-test desktop ports


This living ExecPlan follows .planning/PLANS.md.

## Purpose / Big Picture


Let separate implementation worktrees run packaged repository navigation and task tests on independent owned virtual desktops without sharing TCP 55174. Existing Xvfb ownership, loopback-only binding, assertions and teardown remain unchanged. A user can select SWARM_VIRTUAL_DISPLAY and SWARM_VIRTUAL_DESKTOP_PORT; unspecified port remains 55174.

## Progress


- [x] (2026-09-07) Verified clean assigned c312871 baseline and read harness contract.
- [x] (2026-09-07 20:10Z) Extracted old fixed guard: 5 RED / 2 PASS; corrected shared validation: 7 PASS. Both launchers now consume helper and bind its loopback port.
- [x] (2026-09-07 20:13Z) Actual two-port/two-display overlap proved. Task and three navigation cases passed; unfamiliar task Reveal timed out. All five owned desktops cleaned up. Full navigation aggregate remains failed; no retry or cause claim.
- [x] (2026-09-07 20:18Z) Corrected quality1481/105 and seven focused checks passed. Native/Google full and fix-delta council CLEAN; Sonnet240s no-review unavailable.
- [ ] Normal PR57 landing held for ROOT disposition of the unfamiliar Reveal failure and reserved B1 merge order. All owned changes pushed; Ditz follow-up records preserved.

## Context and Orientation


tools/virtual-desktop-run.sh owns a private runtime directory, Xauthority file, display token and process sessions. It validates the requested port, exports SWARM_DEV_PORT plus the exact --swarm-window-marker=http://127.0.0.1:PORT/ argument, and waits for a loopback listener. tools/repository-navigation/launch.mjs and tools/task-integration/launch.mjs authenticate a private ownership directory but independently reject all ports except 55174. Their servers are readiness signals for packaged Electron UI, not a renderer network API. Navigation already consumes the task-integration sources package, so a small helper there needs no global build dependency change.

## Plan of Work


First add a shared resolveOwnedVirtualPort(environment) helper under tools/task-integration, preserving existing behavior initially so nondefault tests fail for the actual restriction. Then validate the decimal port against SWARM_VIRTUAL_DESKTOP_PORT (default 55174), exact marker and private ownership display/token/Xauthority; use that value for both loopback listeners. Add a focused Node test invoked exclusively by a Bazel shell test in the same package. Do not edit acceptance drivers, virtual supervisor, renderer, provider, protocol or global build settings.

## Milestones


The first milestone is checked port compatibility: normal default contexts pass, valid nondefault contexts stop failing, and malformed/mismatched/unowned contexts fail before a server opens. The second is actual concurrency: prebuild the two Bazel smoke targets once, then run their generated binaries on separate virtual displays and ports with separate evidence paths. Observe both matching listeners during overlapping lifetimes and verify all original package assertions plus owned teardown. The last milestone records exact review and merge evidence without rerunning unrelated suites for paperwork.

## Concrete Steps


Run commands from the assigned worktree:

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel test --jobs=3 //tools/task-integration:owned-port-test --test_output=errors
    nix develop --command bazel build --jobs=3 //tools/repository-navigation:smoke //tools/task-integration:smoke

Use the built Bazel binary launchers concurrently with SWARM_SOURCE_WORKSPACE pointing here, SWARM_VIRTUAL_DISPLAY=:126 / :127 and SWARM_VIRTUAL_DESKTOP_PORT=55206 / 55207. This avoids concurrent source-mutating builds while exercising unchanged packaged smoke jobs. Record exact commands and results in the step evidence directory. Full suites in separate worktrees use explicit --test_env forwarding for both variables; tests within one suite keep existing exclusive tags.

## Validation and Acceptance


The focused regression must show the old restriction rejecting a valid nondefault owned context before correction. After correction it must pass both default and nondefault cases and reject invalid numeric formats, mismatched port/marker/display/token, missing ownership and unsafe ownership records. Actual two-job evidence must show independent loopback listeners, X displays, private runtime roots and complete cleanup with the unchanged navigation/task assertions. Synthetic ownership tests do not substitute for actual GUI proof.

## Idempotence and Recovery


The existing harness rejects occupied ports/displays and tears down only registered processes. Do not kill existing listeners or use DISPLAY=:0. Preserve evidence from failed runs and diagnose only the bounded owned delta. No global lock-root changes. Keep worktree/branch for recovery; do not delete peer files. Only exact ROOT-cleared bases may be normally merged into the feature branch.

## Surprises & Discoveries


The supervisor writes display/token/Xauthority metadata but no private port file. Port authority is the launch environment it constructs and exact normalized window marker. Navigation already depends on the task-integration source filegroup, avoiding new global BUILD coupling. Actual first overlap at 20:10:50.983Z observed both distinct readiness response bodies, :126/:127 sockets and different ownership tokens. Task package passed its unchanged acceptance at port55207 in20.0s with cleanup1; navigation passed Swarm100.686s, invalid-name1.878s and fingerprint-budget2.057s, but unfamiliar timed out waiting directory src after task Reveal. All four navigation cases cleaned up. These are executable67ef71f observations, not synthetic tests.

First broad quality run exposed the Node:test filename also being collected by Vitest and an old static boundary test requiring the literal55174 guard. Commit045a48a renamed the focused runner to owned-port.check.mjs and migrated only the old guard assertions to the shared helper/dynamic loopback bind, preserving every other assertion. Fresh corrected quality passed1481/105 and the seven Node checks passed. No production code changed in this correction. The original GUI failure is not explained by these test-wiring fixes.

## Decision Log


Use the existing harness, not a new desktop allocator. Keep GUI tests exclusive within one Bazel invocation; separate prepared smoke binaries can demonstrate actual cross-worktree-style concurrency without modifying their assertions. ROOT clearance for delivery commit94efa689 appeared before implementation; normal conflict-free composition67ef71f consumed exactly that base. ROOT subsequently reserved the next master merge for B1, so PR57 cannot normal-merge until released. Independently retain the new unfamiliar Reveal failure for ROOT severity/disposition, not an unapproved waiver or broad debugging project.

## Interfaces and Dependencies


resolveOwnedVirtualPort(environment = process.env) returns a Promise<number> or rejects before launch. Node built-ins only. Both launchers continue binding 127.0.0.1. The shared helper lives in the already shared tools/task-integration source filegroup; focused tests use Node's built-in test runner through Bazel.

## Artifacts and Notes


Operational logs and concise seam live in /tmp/swarm-ide-demo-release.GY8Uwv/virtual-ports. Source baseline c3128715; branch fix/parallel-virtual-ports. Ditz issue parallel-virtual-desktop-ports-20260907.

## Outcomes & Retrospective


The bounded compatibility change is implemented and reviewed; default55174, nondefault ports and negative ownership tests pass. Actual simultaneous packaged task/navigation listeners and private desktops are proven, with complete cleanup. The full navigation journey is NOT green: unfamiliar task Reveal timed out, no causal attribution. PR57 remains held, Ditz parallel-port-navigation-reveal-timeout-20260907 is open, and parallel-virtual-desktop-ports-20260907 remains in progress until disposition/landing. No provider, physical desktop, shared app, acceptance-driver or harness changes occurred.

Revised after actual execution to distinguish successful concurrency from failed aggregate acceptance, record exact test-wiring corrections and retain an honest, reviewed held increment.
