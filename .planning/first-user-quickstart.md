# Give first users a working starting point

This plan follows `.planning/PLANS.md`. Keep its progress and evidence current.

## Purpose / Big Picture

A new reader should be able to open Swarm on Linux, point it at another project,
and optionally observe an existing tmux swarm without building a development
server or duplicating agents. A Mac evaluator should know what the browser demo
can show before downloading its image dependencies.

## Progress

- [x] (2026-09-08) Read the current launcher, installed/container guides, and stale evaluator/tour entrypoints; start `swarm-first-user-quickstart`.
- [ ] Replace the README/evaluator entrypoint and five-minute tour; clarify Linux/container details.
- [ ] Check documented flags and local links; obtain a light native review.
- [ ] Push a ready PR, record Ditz outcomes, and hand off commands and limits to ROOT.

## Assumptions and Scope

The reviewed base is `220742e8`. This is documentation only in
`docs/first-user-quickstart`; no launcher, schema, graph or provider changes.
Readers already have authorized access to the private repository. The Linux
route assumes Nix with flakes and a normal X11 desktop. Existing Linux package
and container proofs are historical evidence, not tests rerun by this edit.
Mac/ARM execution is not verified, and this container cannot run the owned-process
agent/build workflow. New worktree-browser and target-build work is pending.

## Context and Orientation

`tools/cli/launcher.mjs` defines installed flags; `tools/cli/tmux.mjs` performs
explicit session association. `docs/linux-install.md` already documents the
installed command. `README.md`, `docs/evaluator-install.md`, `docs/demo.md` and
`docs/demo/presenter-guide.md` still emphasize the older development-only tour.
`docs/container-demo.md` contains the actual image and platform restrictions.

## Plan of Work and Milestones

First put `nix run . -- --workspace ...` and `nix profile install .#swarm-ide`
at the front. Keep source development in a separate contributor section. Explain
the Git working-tree root, per-project profile, local Ditz ref and optional tmux
or existing-registry flags without making agents mandatory for browsing.

Then make the tour follow the existing four-graph workspace, source, registered
conversation, live Activity, Work Log, and current worktree inspector/terminal
controls. Describe pending native worktree switching and generic builds as pending,
not as steps the reader should attempt. Keep the detailed historical proof in
the presenter guide, separately attributed from the revised tour.

## Validation and Acceptance

From this worktree run `nix develop --command bazel test --jobs=3
//tools/cli:checks` for the documented argument behavior. Inspect `launcher.mjs`
and the renderer labels directly. Check Markdown local targets and `git diff
--check`; a light native documentation review must find no unsupported setup or
tour claim. Do not rebuild Nix or rerun GUI suites for prose-only edits.

## Surprises & Discoveries

The README called the dev command the only interactive entry even though the
Linux package already exists. The old tour also said no in-app summarizer exists;
the current Work Log has explicit Start/Stop and a configurable summary worker.

## Decision Log

- Decision: make native Linux the full workflow and Docker/noVNC a browsing fallback.
  Rationale: these have different actual process capabilities, not just different launch commands.
  Date/Author: 2026-09-08, first-users.
- Decision: reuse attributed installation proofs, not repeat them for documentation.
  Rationale: runtime is unchanged and the requested scope is a fast first-user handoff.
  Date/Author: 2026-09-08, first-users.

## Idempotence and Recovery

Do not force-fetch an existing Ditz branch, publish access/images, inspect account
files, or start/steer agents as a documentation test. Preserve existing source and
profiles. ROOT alone merges and adopts the pushed documentation PR.

## Outcomes & Retrospective

Pending documentation and review. Final evidence will distinguish current direct
checks from previously run installation and desktop proofs.

## Interfaces and Dependencies

No executable interface changes. Document existing `--workspace`,
`--user-data-dir`, `--tmux-server`/`--tmux-socket`, `--tmux-session`, and
`--agent-registry`. Architecture mappings remain unchanged because no component
or Bazel input changes.
