# Open a project with one command

This living plan follows `.planning/PLANS.md`. ROOT owns normal merging and managed-window adoption.

## Purpose / Big Picture

Running `swarm-ide` in a Git worktree, a nested source directory, or a bare repository with worktree children should open a useful project window without flags or manually creating configuration. The installed `swarm` alias and explicit flags remain supported. No startup step creates branches, edits project files, or starts agents.

## Progress

- [x] (2026-09-09 15:05Z) Read instructions and current CLI, package, registration and test boundaries; started `swarm-zero-config-launch`.
- [ ] Add Git discovery, private reusable project configuration and tests.
- [ ] Wire package aliases and checked current-tmux discovery; update design and installation docs.
- [ ] Run focused CLI checks, native review and one owned installed desktop proof; push ready PR and handoff.

## Surprises & Discoveries

The current launcher only canonicalizes a directory; it does not resolve the Git root. Its existing tmux helper already discovers and verifies exact pane owners but always allocates a new registry and requires explicit session options. The package provides only `swarm`.

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

Implementation and evidence pending.

Initial plan records the selection, persistence and no-agent-start boundaries before code changes.
