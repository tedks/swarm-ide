# Run selected Bazel targets in the selected project's development environment

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` must be kept current while work proceeds.
It is maintained according to `.planning/PLANS.md`.

## Purpose / Big Picture

An explicit Build or Test launched from Swarm currently uses only the installed
application's runtime tools. A Nix-based project can therefore fail before Bazel's
action or test assertion because a development dependency such as `pnpm` is absent.
After this change, a selected workspace with `flake.nix` enters that workspace's
default Nix development shell for the existing exact Bazel invocation. A non-Nix
workspace keeps the direct pinned-Bazel behavior. Swarm reports preparation and
setup failures honestly, never installs dependencies, and Stop owns the complete
Nix-plus-Bazel process tree.

## Progress

- [x] (2026-09-13 19:42Z) Read the assignment, common protocol, repository instructions,
  planning contract, current executor, package, tests, proof, and runtime design mapping.
- [x] (2026-09-13 19:42Z) Claimed Ditz issue `swarm-bazel-project-environment` and recorded
  the narrow flake-only implementation boundary.
- [x] (2026-09-13 19:47Z) Added and observed failing regressions for flake selection, non-Nix fallback, preparation failure,
  dependency guidance, cancellation in preparation and execution, workspace isolation,
  exact one-command execution, and no replay.
- [x] (2026-09-13 19:50Z) Implemented the smallest owned flake-aware launcher and packaged its Nix CLI runtime.
- [x] (2026-09-13 19:54Z) Extended and passed the actual packaged-worker proof with a dev-shell-only executable while
  scrubbing inherited development environment state.
- [x] (2026-09-13 20:36Z) Updated the runtime design, additive mapping, living plan,
  seam, and verification evidence after the final installed-package proof.
- [x] (2026-09-13 20:36Z) Pushed the implementation and reached a clean five-round
  Codex/Claude/Google council fixpoint; Ditz/PR landing records are the final session step.

## Surprises & Discoveries

- Observation: The executor already launches arbitrary fixed executables and argv inside
  a private PID namespace, so Nix and Bazel can share the existing cancellation, deadline,
  output bound, drain, and cleanup guarantees without a detached preparation process.
  Evidence: `core/target-build-process.ts` passes `executable` and `args` to
  `createOwnedCodexTransport`; `core/agents/owner.ts` closes the namespace control pipe.
- Observation: The installed package exposes pinned Bazel, Java, Node, Git, tmux, and
  util-linux, but not an explicit Nix CLI runtime dependency.
  Evidence: `nix/package.nix` constructs the wrapper PATH with those packages only.
- Observation: The pre-implementation run failed all four newly observable environment
  behaviors while two unrelated task-navigation tests also timed out; the dedicated runner
  check avoids conflating those UI fixtures with this executor gate.
  Evidence: the red `//tools/build-graph:target-checks` run reported four runner failures
  and two `plan-first-cockpit` failures; after implementation
  `//tools/build-graph:environment-checks` passed all runner tests.
- Observation: A fixed child launcher distinguishes Nix preparation from Bazel without
  parsing Nix output and does not weaken process ownership.
  Evidence: the actual packaged probe observed preparation followed by BEP milestones;
  all eight jobs reported `cleanup: confirmed`.
- Observation: A daemon-backed Nix installation builds derivations outside Swarm's PID
  namespace, so namespace cleanup alone cannot prove preparation work stopped.
  Evidence: council reviewers identified the boundary; the revised actual probe observed
  an uncached ten-second derivation start, cancelled the owned client, waited eleven seconds,
  and confirmed the derivation output was still unrealized and the lock byte-identical.
- Observation: Package-file presence and `swarm --help` do not prove the installed worker
  can run a selected target with the wrapper's runtime closure.
  Evidence: the final `//tools/build-graph:installed-package-proof` derives the immutable
  wrapper's environment under `env -i`, loads the installed `core/worker.js`, and passes the
  complete flake Build/Test/failure/cancellation probe with the packaged Nix client.

## Decision Log

- Decision: Support `flake.nix` in this increment and leave `shell.nix` as an explicit
  follow-up rather than guessing at legacy shell selection semantics.
  Rationale: `nix develop --command` has a direct argv-preserving form for flakes, and the
  assignment permits a proved flake boundary when legacy support is awkward.
  Date/Author: 2026-09-13 / Codex.
- Decision: Invoke the installed pinned Bazel path from inside the selected flake's default
  development shell, rather than accepting whichever Bazel the project happens to expose.
  Rationale: This preserves the existing exact operation, version, private cache, rc policy,
  and bounded worker arguments while adding only project environment variables and tools.
  Date/Author: 2026-09-13 / Codex.
- Decision: Never materialize dependencies automatically. Detect recognizable missing
  dependency output after the owned command and add frozen-install guidance without
  replacing the real exit code or retained diagnostics.
  Rationale: Explicit Build/Test authorizes project execution but not lock changes or
  installation on every job.
  Date/Author: 2026-09-13 / Codex.
- Decision: Use an exclusive marker file created immediately before a no-shell Node spawn
  of pinned Bazel, rather than infer preparation completion from human-readable output.
  Rationale: The marker survives bounded output truncation, cannot collide across jobs, and
  makes assertion/setup classification independent of Nix's wording.
  Date/Author: 2026-09-13 / Codex.
- Decision: Treat the host Nix daemon as a shared prerequisite, not a process Swarm can own,
  and prove its unique job work is abandoned when the owned client disconnects.
  Rationale: Another client may legitimately keep shared derivation work alive, but a unique
  cancelled Swarm preparation must not survive. Cleanup wording documents that it attests
  the client namespace, not shutdown of the shared system daemon.
  Date/Author: 2026-09-13 / Codex.
- Decision: Make the package proof cross the installed worker and wrapper-runtime boundary,
  and require a daemon store before claiming the daemon-cancellation property.
  Rationale: checking files or a help path can pass while pinned Bazel, Java, Nix, or worker
  startup is broken; the acceptance proof must execute the same installed composition.
  Date/Author: 2026-09-13 / Codex.

## Outcomes & Retrospective

The final installed-package proof passes for build and test actions that depend on a tool
available only in the selected locked flake. It loads the installed worker with wrapper-
derived Node 22.23.2, Nix 2.34.8, pinned Bazel 7.6.0, and pinned JDK 21.0.12 under an empty
inherited environment. It also proves unique daemon work does not survive preparation
cancellation, exact failures remain failures, lock bytes do not change, and cleanup is
confirmed. Focused executor/mapping checks pass. Five council rounds converged to CLEAN
from the native Codex, Claude Sonnet, and Google seats. Legacy `shell.nix` support remains
explicitly tracked as `swarm-bazel-shell-nix-environment`; no UI or request schema changed.

## Context and Orientation

`core/build-jobs.ts` owns the observable job lifecycle and calls the
`TargetBuildExecutor` interface. `core/target-build-process.ts` resolves installed tools,
creates one private Bazel cache per workspace service, watches Bazel's Build Event Protocol
(BEP) file for live milestones, and delegates the process tree to
`core/agents/owner.ts`. The owner starts a guardian in a private Linux PID namespace;
closing its control pipe terminates descendants and reports whether cleanup was confirmed.
`tests/target-build-jobs.test.ts` checks service and executor behavior. The packaged actual
path is exercised by `//tools/build-graph:target-probe`, whose bundled module starts the real
worker against a disposable repository. `nix/package.nix` defines the installed wrapper's
runtime closure and PATH. `docs/design/runtime.md` and the `design:runtime` entry in
`.swarm/plans.json` are the living design and actual source-to-Bazel mapping.

## Plan of Work

First extend executor tests before implementation. Inject only narrow filesystem/tool
resolution seams needed to make flake and non-flake selection deterministic; preserve the
public request schema and executor call shape. Tests must prove that a flake root launches
one owned command whose executable is Nix and whose `develop --command` suffix contains the
existing pinned Bazel path plus the unchanged operation argv, while a non-Nix root launches
Bazel directly. They must also prove preparation messages, clear unavailable-Nix and
dependency guidance, cancellation during both phases, root isolation, and no replay.

Then implement selection in `core/target-build-process.ts`. Before launch, check only for a
regular accessible `flake.nix`. Resolve `nix` only for that branch, publish a preparation
message, and start Nix itself inside the existing guardian. A small fixed Node launcher,
also inside that namespace, will emit a private marker immediately before replacing itself
with pinned Bazel; this separates Nix preparation failure from Bazel failure without shell
evaluation. All target and operation values remain individual argv elements. Retain the
real exit code and output; append concise frozen dependency setup guidance only for known
missing-dependency diagnostics.

Add Nix to the installed package wrapper PATH. Extend the existing actual target proof or a
narrow companion target so it builds the packaged worker, creates a disposable flake whose
action resolves an executable available only through its dev shell, scrubs inherited Nix
development variables and PATH tools, and verifies both Build and Test through the real
worker. The fixture uses the repository's asserted nixpkgs lock. It may use the host's
configured substituter on first realization, but must never depend on an unpinned input or
change this repository's or the fixture's lock.

Finally update the runtime design and mapping, run the focused target checks and actual
proof through `nix develop --command bazel`, and record tool versions and source scope.
Commit and push granularly, open a draft PR early, run the Codex/Claude/Google council to a
clean proportional fixpoint, make the PR ready, finish and sync Ditz, and verify the branch
is up to date with origin. ROOT, not this worker, merges or consumes the palette peer.

## Concrete Steps

All repository commands run from
`/home/tedks/Projects/swarm-ide/bazel-project-environment`.

Run focused checks after the regression and implementation:

    nix develop --command bazel test --jobs=3 //tools/build-graph:environment-checks --test_output=errors

Run the installed-path proof without relying on cached test results:

    nix develop --command bazel run --jobs=3 //tools/build-graph:target-probe

Build and inspect the installed closure with no inherited runtime environment:

    nix build .#swarm-ide --no-link --print-out-paths
    nix develop --command bazel run --jobs=3 //tools/build-graph:installed-package-proof -- /nix/store/<printed-swarm-path>

Run design/mapping checks covering the touched living documentation:

    nix develop --command bazel test --jobs=3 //tools/living-design:checks --test_output=errors

## Validation and Acceptance

The unit regression must fail before implementation because every root currently launches
pinned Bazel directly. It passes when a flake root publishes preparation progress and one
owned Nix invocation contains one exact pinned Bazel operation, while a non-Nix root keeps
one direct invocation. A Nix evaluation failure must produce a failed job described as a
development-environment preparation failure. A Bazel action missing materialized
dependencies must retain its nonzero exit and diagnostics and add the exact project setup
guidance `nix develop --command pnpm install --frozen-lockfile` only when the project has the
matching pnpm lockfile. Stop during preparation or Bazel must remain Stopping until the same
owned namespace confirms cleanup, and another workspace's executor must not share root,
cache, progress, or command state.

The actual packaged proof passes only if a disposable flake's Bazel Build and Test can use
an executable absent from the scrubbed parent PATH but supplied by the dev shell. Evidence
must identify local Node, pnpm, Bazel, and Nix versions plus the exact source scope without
capturing credentials or the inherited environment.

## Idempotence and Recovery

Focused Bazel commands and disposable proof fixtures are repeatable. The executor removes
its private cache only after confirmed disposal and retains it when cleanup is unknown.
Tests must clean their temporary roots only after owned shutdown. No command installs target
project dependencies, edits a user flake or lockfile, changes global Nix configuration, or
touches another worktree. If the flake cannot evaluate, the job fails with its original
diagnostics and can be retried only after the operator fixes the project.

## Artifacts and Notes

The role handoff files live outside the repository at
`/tmp/swarm-ide-bazel-palette.MwU6VN/environment`: `ready.md`, `seam.md`, and
`final-recap/verification.md`. They contain no credentials or complete environment dumps.

## Interfaces and Dependencies

`TargetBuildExecutor.run(target, signal, progress, operation?)` and all protocol schemas
remain unchanged. `createTargetBuildExecutor(root)` continues to own one cache and no more
than one process per accepted job. The only new installed runtime dependency is the Nix CLI
required to enter the selected project's declared development environment. The launcher
uses Node's process APIs with fixed argument boundaries and no shell.

Plan revision note (2026-09-13 19:42Z): Initial self-contained plan records the flake-only,
argv-preserving, no-install boundary after inspecting the existing implementation.

Plan revision note (2026-09-13 19:55Z): Updated after the red regression, implementation,
and packaged-worker proof to record the marker decision, green evidence, and remaining
package/review gates.

Plan revision note (2026-09-13 20:12Z): Updated after council round one to record daemon
cancellation and installed-package proof decisions, narrower failure classification, and
the first fix delta's actual evidence.

Plan revision note (2026-09-13 20:36Z): Finalized after the installed-worker/package-wrapper
proof and five-round council fixpoint; recorded exact runtime versions, daemon/event-driven
cancellation, the explicit `shell.nix` follow-up, and completed handoff evidence.
