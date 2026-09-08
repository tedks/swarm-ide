# Install Swarm IDE as a Linux command

This ExecPlan follows `.planning/PLANS.md` and is kept current as implementation proceeds.

## Purpose / Big Picture

An operator should be able to install Swarm IDE once, then run `swarm --workspace ../project` without running Vite, changing the project checkout, or keeping this source checkout around. Nix will provide Electron and the local tools the existing core needs. Agent harnesses and authentication remain the operator's existing tools and configuration; this package does not copy credentials or create a competing agent owner.

## Progress

- [x] (2026-09-08) Inspected the production bundle, fixed local-core launch, Nix shell and task scope.
- [ ] Add a strict invocation-relative launcher and direct Bazel-owned tests.
- [ ] Add a real Nix package and app with fixed dependency fetching and production bundle build.
- [ ] Prove installed launch against a disposable Git repository on an owned virtual desktop.
- [ ] Complete focused native review, docs, Ditz accomplishment notes and pushed PR.

## Surprises & Discoveries

The existing `//:desktop-bundle` already contains Electron main/preload, the local core including its YAML module and owner helper, and relative renderer assets. It is built from checkout `node_modules` by a local Bazel rule, not yet an installable derivation. The flake exports only Linux development shells.

## Decision Log

Preserve the existing `app/`, `core/`, `renderer/` tar layout so the parallel container worker can consume the same production artifact independently. Keep installed application files immutable and preserve ordinary user state/config locations. Do not introduce a dev server or a persistent service for normal launch. The package supplies Git, Node, tmux, util-linux and the pinned Bazel/Java runtime while leaving the operator's harness discovery intact.

## Outcomes & Retrospective

Implementation and actual Linux install proof are pending. This work makes no macOS execution claim; the container worker owns that evaluator path. aarch64 Linux support can be exposed through the existing flake system list but will be explicitly distinguished from this host's x86_64 proof.

## Context and Orientation

`flake.nix` currently supplies Electron and build tools only inside `nix develop`. `tools/build-app.sh`, called by `//:desktop-bundle`, creates `swarm-ide-foundation.tar.gz`. `app/electron/main.ts` loads the packaged HTML if `SWARM_RENDERER_URL` is absent and passes `SWARM_WORKSPACE_ROOT` into the local core. Electron's userData directory owns durable run state. `app/electron/core-launch.ts` locates `core/worker.js` relative to the immutable installed entrypoint. The new command belongs in `tools/cli/`, its package in `nix/`, and usage in `docs/linux-install.md`.

## Plan of Work

First implement a small command that accepts `--workspace PATH`, defaults to the invocation directory, validates a directory before spawning Electron, and passes arguments as an array rather than shell evaluation. Help and invalid input must work without a display. Clear only development launch controls so the installed command cannot accidentally point at a running Vite server; preserve user configuration, tool discovery and X11 authentication. Provide a deliberate user-data path option without relocating every tool's XDG directory.

Then package the unchanged production bundle through Bazel inside a Nix derivation. Fetch pinned pnpm dependencies separately, install them offline inside the writable build directory, and install only the generated bundle plus launcher. Export packages.default, packages.swarm-ide, and apps.default/apps.swarm. Coordinate any required build-script change with the container owner before editing it.

Finally run focused launcher tests, build the package locally, and use the existing owned `tools/virtual-desktop-run.sh` harness with a new narrow CLI scenario. Open a deliberately selected temporary Git repository from a different invocation directory, verify its name and real source through the normal core/renderer path, record a screenshot, and close the owned window. Do not touch the managed user desktop.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/usability-linux-install`, branch `feature/usability-linux-install`. Use `nix develop --command bazel test --jobs=3 //tools/cli:checks` for direct CLI cases and `nix build .#swarm-ide` for package creation; the derivation invokes Bazel, not an independent native build. The final smoke target and exact install command will be documented once implemented. Commit and push the plan early, then publish coherent implementation commits and a ready PR. ROOT owns normal merge and shared-preview adoption.

## Validation and Acceptance

The command must resolve relative and space-containing workspace paths from the caller, reject missing/unknown arguments before launching, preserve the selected workspace and user state, and not evaluate shell text. An installed launch must load bundled renderer assets without a dev server and show the chosen real repository. The source checkout must remain unchanged by installed execution. The Nix dependency hash must describe a real fetched store, not a placeholder at handoff. Native review checks these assumptions and the distinction between tested Linux and untested platforms.

## Idempotence and Recovery

Builds use disposable Nix build directories. GUI proof uses a temporary repository and owned virtual process/display resources. Preserve PR branches and evidence; never remove unrelated worktrees or user configuration. A failed package build is recorded and corrected at its concrete boundary, not replaced by a claim that the dev wrapper is an installed app.

## Artifacts and Notes

Step handoff and proof live in `/tmp/swarm-ide-usability.BirZCk/linux-install/`. Ditz issue `swarm-installable-cli-flake` records human outcomes, with remaining limitations filed separately if necessary.

## Interfaces and Dependencies

The public command is `swarm [--workspace PATH] [--user-data-dir PATH]`. Help documents the default invocation directory. The installed bundle remains `app/electron/main.js`, `app/electron/preload.js`, `core/**`, `renderer/**`. Existing development and virtual desktop entrypoints remain unchanged.
