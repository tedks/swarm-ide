# Launch a clean checkout against a chosen repository

This ExecPlan follows `.planning/PLANS.md` and is maintained as work proceeds.

## Purpose / Big Picture

An evaluator should be able to clone Swarm IDE, materialize its pinned dependencies with Nix, and open either that checkout or another real repository through one documented Bazel command. The IDE checkout supplies trusted tooling; the selected repository supplies browsable data, not executable launch scripts. A five-minute tour must distinguish implemented features from unavailable agent execution and recorded examples.

## Progress

- [x] (2026-09-07) Verified designated clean branch and exact reviewed baseline; consumed assignment after compaction.
- [ ] Implement explicit workspace selection and focused rejection tests.
- [ ] Prove documented launch from a new checkout against a second real repository on owned virtual X11.
- [ ] Finish truthful installation/tour documentation, review, local gates, push and normal PR landing or exact hold.

## Surprises & Discoveries

The existing `tools/dev.sh` changes to the IDE checkout and invokes its internal package script without forwarding any arguments. Existing port selection is explicit but defaults to 5173. More exact findings will be recorded with evidence.

## Decision Log

The public interface is `bazel run //:dev -- --workspace <path>`, with the IDE checkout as default. Relative paths resolve from the user's invocation directory, not Bazel's execution directory. Invalid arguments and nonexistent targets fail before any application launch. No repository scripts, account configuration or credentials are inspected. This remains one coherent delivery PR, not an artificial PR stack.

## Outcomes & Retrospective

Implementation and real installation evidence are pending. No standalone installer, cross-platform support, real managed-provider turn or unmerged peer feature is claimed.

## Context and Orientation

`tools/dev.sh` is the Bazel development entry. The internal dev script runs Vite and Electron; `app/main` selects the local-core repository. `flake.nix` and `pnpm-lock.yaml` pin tools and dependencies. `tools/virtual-desktop-run.sh` owns isolated X11 automation. The distributable archive currently produced by `tools/build-app.sh` must be inspected before documenting its runtime boundary. Ditz task data lives on a separate Git branch, not in the source tree.

## Plan of Work

First inspect the existing dev process and repository registration. Add only focused argument parsing and propagation from the public launcher to main, preserving all safety boundaries. Add regression tests for default, relative, absolute, missing and non-repository paths and occupied-port reporting. Then add `tools/demo-install` as a Bazel-owned installation proof that uses a disposable checkout and second repository, never the physical desktop. Finally document exact prerequisites, materialization, launch, boundaries and a tour of verified features in README.md and docs/demo.md.

## Concrete Steps

From this worktree run `nix develop --command pnpm install --frozen-lockfile`, use Bazel with `--jobs=3` for focused tests and production bundle, and run the new installation proof while holding the shared virtual-desktop lock. Normal human launch is `SWARM_DEV_PORT=55173 nix develop --command bazel run --jobs=3 //:dev -- --workspace /absolute/path/to/repo`. Record exact proof commands and observations after execution.

## Validation and Acceptance

A new disposable checkout at a different path must materialize dependencies without private temp paths, start the actual UI, and open a committed file in a second disposable non-Bazel repository. The UI must report unavailable build evidence honestly. Invalid workspace and occupied loopback port must produce actionable errors without starting another app. Ditz branch availability in a fresh clone must be proved or documented as an explicit fetch step. Screenshot and logs must distinguish warm shared dependency caches from fresh checkout state. Review uses native OpenAI and foreign Google/Sonnet seats; missing seats are recorded honestly. One final meaningful local gate is sufficient; hosted CI is ignored under release authority.

## Idempotence and Recovery

Tests create uniquely owned temporary directories and processes. Cleanup targets only those owned processes; preserve evidence and worktrees. The selected user repository is not initialized, altered or overwritten by the launcher. Failures stop with an explicit error, not a different implicit workspace or port.

## Artifacts and Notes

Operational evidence and concise integration notes live in the assigned step directory; distributable docs contain no private session paths or raw transcripts. Pending peer features stay out of publish-ready copy until ROOT verifies integration.

## Interfaces and Dependencies

Use the existing pinned Node/Nix/Bazel/Electron tools and current typed local-core registration. Do not add dependencies, change the lockfile or flake, activate providers, or alter admission policy. B1 owns dynamic build queries, H1 external-agent registration, and V1 plan/task navigation; their implementation is not a dependency of this delivery increment.

Initial plan records bounded assumptions and acceptance before implementation.
