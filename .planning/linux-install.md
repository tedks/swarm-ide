# Install Swarm IDE as a Linux command

This ExecPlan follows `.planning/PLANS.md` and is kept current as implementation proceeds.

## Purpose / Big Picture

An operator should be able to install Swarm IDE once, then run `swarm --workspace ../project` without running Vite, changing the project checkout, or keeping this source checkout around. Nix will provide Electron and the local tools the existing core needs. Agent harnesses and authentication remain the operator's existing tools and configuration; this package does not copy credentials or create a competing agent owner.

## Progress

- [x] (2026-09-08) Inspected the production bundle, fixed local-core launch, Nix shell and task scope.
- [x] (2026-09-08 13:53Z) Added invocation-relative launcher, explicit profile bootstrap and twelve direct Bazel-owned tests.
- [x] (2026-09-08 13:53Z) Built the real Nix package with actual fixed pnpm/Bazel dependency hashes; `nix run` help and disposable profile installation passed.
- [x] (2026-09-08 13:53Z) Installed launch opened a real separate Git repository/source with development-tool PATH removed, confirmed the effective profile, and cleaned owned X11 resources.
- [x] (2026-09-08 14:07Z) Added the user's targeted tmux association request using existing checked registration and explicit server/session selection; direct tests and package pass.
- [x] (2026-09-08 14:22Z) Installed existing-registry launch showed actual ROOT/worker activity from a separate chosen repository; original owner survived IDE cleanup.
- [x] (2026-09-08 14:25Z) Native selector/proof/mapping deltas CLEAN; exact approved runtime mappings match queried Bazel dependencies.
- [ ] Automatic discovery of CLI processes holding native helper rollouts needs a small shared-registration correction; ownership request sent to ROOT, existing-registry path is usable.
- [x] (2026-09-08 14:28Z) Final documentation, follow-up issues and the useful installed-package handoff are committed/pushed; ROOT decides the separately requested shared discovery correction.

## Surprises & Discoveries

The existing `//:desktop-bundle` already contains Electron main/preload, the local core including its YAML module and owner helper, and relative renderer assets. It is built from checkout `node_modules` by a local Bazel rule, not yet an installable derivation. The flake exports only Linux development shells.

The first offline package attempt showed that Nix's Bazel dependency archive does not include Bzlmod registry metadata. Legacy workspace mode inside this derivation captures the actual toolchain archives and then builds offline. No normal-development Bazel configuration changed. pnpm's Electron installer includes unused musl native modules, so only host GNU bindings are patched before Vite runs.

The first installed GUI proof opened the correct source but did not check profile state. A stronger file-existence check failed because `Local State` was absent during the run; that failure alone does not establish why. The installed entry now explicitly sets Electron's userData before launching the fixed main and reports `app.getPath`, allowing the final proof to verify the actual chosen profile without assuming a Chromium flag or file-flush timing.

The actual tmux run found two distinct problems. A bare `display-message -t =session` yielded no session identity; an explicit trailing colon and a real disposable-tmux regression establish its fix. The next run reached registration but the existing helper rejected every native-helper-bearing CLI process because multiple JSONL files were open. Bounded first-line metadata distinguishes the CLI and native children; a narrowly scoped shared-helper correction is requested, not guessed from filenames. The explicit existing-registry launch independently works and preserves the original agent owner.

## Decision Log

Preserve the existing `app/`, `core/`, `renderer/` tar layout so the parallel container worker can consume the same production artifact independently. Keep installed application files immutable and preserve ordinary user state/config locations. Do not introduce a dev server or a persistent service for normal launch. The package supplies Git, Node, tmux, util-linux and the pinned Bazel/Java runtime while leaving the operator's harness discovery intact.

Use a fixed installed `cli/electron-main.cjs` bootstrap for the optional profile and then require the unchanged production main. The launcher clears only development controls and its own inherited profile transport. It does not relocate Codex/GitHub/tool configuration or disable Chromium's sandbox by default.

The targeted launch addition in `/tmp/swarm-ide-usability.BirZCk/project-tmux-feedback.md` adds explicit server/socket plus exact session selection. Reuse `tools/session-registration` discovery/writes; do not duplicate process/rollout authority. Per-launch private registry generations prevent server-ID reuse from mixing scopes and avoid lifetime capacity exhaustion. Prior generations remain available only when explicitly selected. This adds no agent, message, resume, tmux mutation or background daemon.

## Outcomes & Retrospective

Implementation is pushed in PR111. The x86_64-linux production package launches from its Nix store output; `nix run` and disposable `nix profile install` work. Installed source/profile proof took2.032s including startup. The later actual existing-registry proof took2.372s, showed ROOT/worker activity and confirmed the original exact agent owner survived IDE cleanup. The chosen source stayed unchanged and userData matched the requested relative profile. Automatic discovery with native helpers remains a separate narrow limitation. aarch64-linux evaluates but has not been built/run here; follow-up swarm-install-aarch64-proof records that gap. This work makes no macOS claim. The source tar and development entrypoints remain unchanged.

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

The public command is `swarm [--workspace PATH] [--user-data-dir PATH]`, optionally with `--tmux-server NAME` or `--tmux-socket PATH` plus `--tmux-session NAME`. `--agent-registry PATH` instead selects an existing maintained registry. Help documents the default invocation directory. The installed bundle remains `app/electron/main.js`, `app/electron/preload.js`, `core/**`, `renderer/**`, with a fixed package-local CLI/bootstrap outside those original tar entries. Existing development and virtual desktop entrypoints remain unchanged.

Revision note: updated after actual package/profile tests; preserved the first profile-check failure without attributing an unproved historical cause.
