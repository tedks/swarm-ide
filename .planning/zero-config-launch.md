# Open a project with one command

This living plan follows `.planning/PLANS.md`. ROOT owns normal merging and managed-window adoption.

## Purpose / Big Picture

Running `swarm-ide` in a Git worktree, a nested source directory, or a bare repository with worktree children should open a useful project window without flags or manually creating configuration. The installed `swarm` alias and explicit flags remain supported. No startup step creates branches, edits project files, or starts agents.

## Progress

- [x] (2026-09-09 15:05Z) Read instructions and current CLI, package, registration and test boundaries; started `swarm-zero-config-launch`.
- [x] (2026-09-09 15:23Z) Added Git discovery, private reusable configuration and tests, aliases/current-tmux integration and living design/install docs.
- [x] (2026-09-09 15:23Z) All 35 direct tests pass; actual installed Nix artifact built. Native review converged CLEAN after two important boundary findings and the profile follow-up.
- [x] (2026-09-09 15:24Z) One actual installed bare-parent/source proof passed: 1.012s scenario, 2.036s harness, cleanup complete and no renderer errors.
- [x] (2026-09-09 15:26Z) Final documentation pushed, PR145 ready, Ditz accomplishment note synced and own GUI/Bazel cleaned. ROOT owns the remaining normal merge and managed adoption.

## Surprises & Discoveries

The current launcher only canonicalizes a directory; it does not resolve the Git root. Its existing tmux helper already discovers and verifies exact pane owners but always allocates a new registry and requires explicit session options. The package provides only `swarm`.

Native review found that sanitizing Git only during discovery still allowed inherited Git selection variables to redirect the child core, and that checking lexical XDG paths before mkdir allowed symlinked roots/profiles to create source directories before rejection. Both now have dedicated regressions and canonical pre-creation checks; SSH/auth settings remain inherited. All tests were added alongside implementation, not claimed as a separately executed historical RED baseline.

## Decision Log

Use canonical Git common-directory identity for project state, and a separate stable profile for each canonical worktree. This avoids unrelated projects or linked worktrees sharing Electron state. Preserve ordinary non-Git directory opening for existing explicit workspace callers. A genuine bare repository without usable worktrees fails with an actionable message. Git commands are read-only, literal argv, with inherited repository-selection variables cleared.

Store a small versioned project JSON under XDG config and private state/registry/profile under XDG state, outside the repository. Existing malformed configuration is an error, not permission to overwrite. A remembered workspace is only a preference and is revalidated against the current Git worktree list. Current tmux discovery is best-effort and project-scoped; explicit tmux association keeps its current error behavior.

## Context and Orientation

`tools/cli/launcher.mjs` parses flags and launches the immutable Electron package. `tmux.mjs` reuses bundled checked registration. `nix/package.nix` installs those modules and the production bundle; `flake.nix` exposes the app. `tools/cli:checks` runs Node's direct tests through Bazel, while `tools/cli:smoke` owns an X11 desktop and exercises the installed app. New `project.mjs` will perform detection and private setup, independent of Electron.

## Plan of Work

First implement and test project discovery/configuration using disposable real repositories, including `.git` bare containers and direct bare directories. Then wire it before Electron launch, preserving explicit overrides and host auth environment. Add `swarm-ide` alongside `swarm`, and a checked current-pane selection in the existing tmux module that filters discovered roots to this project's worktrees. Finally update the scoped runtime design, source mappings and install instructions, build the installed package and exercise a bare-parent launch in an owned desktop.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/zero-config-launch`. Run tooling with `nix develop --command`. Run focused checks with `bazel --output_base=/tmp/swarm-ide-ready-on-open.nCPyTL/launcher/bazel test --jobs=3 //tools/cli:checks`. Materialize frozen dependencies before package builds. Use `nix build .#swarm-ide --no-link --print-out-paths` for the actual installed artifact and the existing Bazel smoke entry point for its desktop proof.

## Validation and Acceptance

Actual Git fixtures must cover clone/nested paths, linked worktrees, both bare layouts, remembered selection, stale selection, no usable worktree, paths with spaces and symlinks. Config reuse preserves unrelated markers and explicit registry/profile choices, malformed config is unchanged, and profiles differ between worktrees. Tmux tests must prove current-pane targeting, unrelated project exclusion and failure fallback without sending messages. The actual installed executable must open a source from its automatically chosen disposable worktree and report a profile created outside source, then leave no owned GUI process running.

## Idempotence and Recovery

Use atomic publication and exclusive initial creation for private JSON files. Do not remove existing config or source directories. Disposable test repositories and GUI resources are owned and cleaned by their harness. Preserve branch and worktree after pushing. Any incomplete acceptance or unavailable native review is reported explicitly; no repeated broad test cycles.

## Artifacts and Notes

Current reviewed base is `395a6170`. Evidence and concise seam are kept in `/tmp/swarm-ide-ready-on-open.nCPyTL/launcher`; no shared preview changes.

## Interfaces and Dependencies

`project.mjs` exports read-only `discoverProject(directory, environment)` and private `prepareProject(options, runtime)`. The latter returns selected workspace, eligible worktrees, registry, profile and config path. Only Node standard library and installed Git are needed. The existing registration helper remains the authority for discovered terminal owners.

## Outcomes & Retrospective

The new installed command resolves both supported bare layouts, preserves explicit choices, remembers valid selection and creates private settings/profile/registry. The 35 focused cases and actual Nix package are green; native important-fix convergence is clean. The installed desktop opened from a disposable bare parent with two worktrees, selected master, opened actual source and verified automatic private profile/config/empty registry. The harness used owned :167/55437 and cleaned up fully. No model, managed window or real project config was touched.

Automatic tmux registration reuses the existing checked helper and is project-scoped at launch only. Exact actual tmux session selection and controlled owner/project filtering are tested; this increment does not claim a new real-model conversation or discovery of every running pane. Linux x86_64 is the executed package platform; no new macOS/ARM execution claim.

Initial plan records the selection, persistence and no-agent-start boundaries before code changes.

2026-09-09 15:25Z update records implementation, review corrections and completed installed-desktop acceptance with exact attribution.
