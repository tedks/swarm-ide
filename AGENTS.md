# Agent Instructions: swarm-ide

A Linux-first, local development cockpit for navigating software systems and
steering agent swarms across the development lifecycle.

## Scope of this file

Global workflow rules live in `~/.claude/CLAUDE.md` (installed from the
dotfiles repo) and apply to every project: landing the plane (session
completion and mandatory push), branch + draft-PR discipline, granular
commits, stacked PRs, the bare-repo/worktree layout, and Nix/Bazel
environment detection. **Do not restate them here.** This file covers only
what is specific to swarm-ide; if a rule belongs to every repo, it
belongs in the global instructions instead.

`AGENTS.md` is the canonical instruction file. Keep `CLAUDE.md` (and
`GEMINI.md`, `COPILOT.md` if present) as symlinks to it unless a specific
agent genuinely needs divergent instructions.

## Project structure

- `app/`: sandboxed React renderer and Electron main/preload processes.
- `core/`: privileged local-core process and provider implementations.
- `protocol/`: shared runtime-validated request, event, focus, graph, and widget contracts.
- `fixtures/`: deterministic mock worlds used by the app and tests.
- `tests/`: Bazel-owned unit, contract, and UI smoke tests.
- `tools/`: development and Linux desktop-verification scripts.
- `docs/`: architecture and product design decisions.

## Environment

This repo uses a Nix flake. Run project tooling through it:

```bash
nix develop --command <cmd>
```

If using direnv, `.envrc` is `use flake`.

The first `nix develop` may download Electron and browser dependencies. The
desktop automation loop currently targets X11 and reports an explicit error on
unsupported compositors.

## Build and test

Use Bazel exclusively for builds and tests:

```bash
nix develop --command pnpm install --frozen-lockfile
nix develop --command bazel build //...
nix develop --command bazel test //...
nix develop --command bazel run //:dev
nix develop --command bazel run //tools:desktop-smoke
```

Do not invoke Vite, TypeScript, Vitest, Playwright, Electron, or package-manager
scripts directly; Bazel targets are the supported entry points.
The frozen `pnpm install` is the required dependency-materialization step for a
fresh clone; CI runs it before Bazel. `bazel build //...` produces
`bazel-bin/swarm-ide-foundation.tar.gz`.

## Issue tracking (ditz)

Issues live as plain-text YAML on the `ditz-metadata` git branch, one
file per issue; the `ditz` CLI reads and writes them. Nothing appears in
the working tree, and no per-worktree setup is needed — any worktree of
this repo can run `ditz`. Install via Nix:
`nix run github:tedks/ditz -- <cmd>` (or install `github:tedks/ditz#ditz`).

```bash
ditz add "title"              # file a new issue (-t bugfix|feature|task, -c <component>)
ditz ready                    # find available work (unblocked, ranked)
ditz show <id>                # view issue details (add --json for machine output)
ditz start <id>               # claim work (marks in_progress)
ditz close <id> --reason "…"  # complete work (or --wontfix / --reorg)
ditz comment <id> "message"   # add a progress note
ditz sync                     # fetch/merge/push the ditz-metadata branch
```

Include `ditz sync` in the end-of-session push workflow:

```bash
git pull --rebase
ditz sync
git push
```

Use `ditz` commands rather than hand-editing the `ditz-metadata` branch.
Ditz has no priority / label / assignee fields: grouping is by component
(`-c <component>`), sequencing is by the dependency graph
(`ditz blocks <a> <b>`), and urgency is derived. Use a deterministic id
with `--id <name>` when you need an idempotent add — re-creating with the
same id is a no-op, which is what makes `ditz add` safe to call from
unattended jobs.

## Planning

ExecPlans for non-trivial work follow the format in
[.planning/PLANS.md](.planning/PLANS.md).

## Repo specifics

- The repository is licensed under GNU AGPLv3.
- The renderer is unprivileged. Filesystem, process, PTY, Git, Bazel, agent,
  deployment, and metrics capabilities belong behind the typed local-core bridge.
- Graphs are separate domain projections coordinated by focus mappings; never
  collapse them into one universal node ontology.
- Mock providers must satisfy the same runtime contracts as real providers and
  exercise delay, failure, stale results, ambiguity, and out-of-order events.
- Build-derived views retain their last consistent snapshot while reconciliation
  is yellow or red; a result may turn green only for its exact input fingerprint.
