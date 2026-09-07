# Launch a clean checkout against a chosen repository

This ExecPlan follows `.planning/PLANS.md` and is maintained as work proceeds.

## Purpose / Big Picture

An evaluator should be able to clone Swarm IDE, materialize its pinned dependencies with Nix, and open either that checkout or another real repository through one documented Bazel command. The IDE checkout supplies trusted tooling; the selected repository supplies browsable data, not executable launch scripts. A five-minute tour must distinguish implemented features from unavailable agent execution and recorded examples.

## Progress

- [x] (2026-09-07) Verified designated clean branch and exact reviewed baseline; consumed assignment after compaction.
- [x] (2026-09-07 19:31Z) Implemented explicit workspace selection and focused rejection tests; draft PR54 pushed.
- [x] (2026-09-07 19:48Z) Proved documented launch from a new checkout, a non-Bazel target and a controlled Bazel target on owned virtual X11; all cleanup checks passed.
- [x] (2026-09-07 19:48Z) Authored truthful installation/tour docs; native and Google fix-delta review CLEAN, Sonnet unavailable; full build and quality passed.
- [ ] Normal PR landing, Ditz closure/sync and final exact merge receipt.

## Surprises & Discoveries

The old launcher always targeted its own checkout. More importantly, native review found that existing automatic topology startup could invoke an external Bazel repository's wrapper before explicit Build. A harmless controlled wrapper reproduced the pinned Nix delegation. Two hook tests failed before correction and all 22 passed after a launcher-derived startup guard. Missing Ditz data is a local-ref issue: an ordinary clone does not create `refs/heads/ditz-metadata`; the documented explicit fetch does.

An intermediate installation aggregate failed at the outer Bash script's end because its source was edited while the running interpreter still read it. Both desktop cases had passed, but that aggregate is not credited. The subsequent corrected execution kept all code frozen throughout and passed. Never edit an executing shell script.

## Decision Log

The public interface is `bazel run //:dev -- --workspace <path>`, with the IDE checkout as default. Relative paths resolve from the user's invocation directory, not Bazel's execution directory. Invalid arguments and nonexistent targets fail before any application launch. Repository scripts do not supply the launcher. External repositories receive no automatic topology authority; explicit Build may execute their build rules and wrapper. No account configuration or credentials are inspected. This remains one coherent delivery PR, not an artificial PR stack.

ROOT approved the narrow startup hook/caller guard and cleared normal composition with PR51. Its optional hook flag preserves legacy/default behavior; a fixed Vite boolean derived from canonical root equality disables external automatic attempts before readiness, including HMR and core recovery. It is a boundary for the supported public dev path, not a claim to sandbox all arbitrary launch routes.

## Outcomes & Retrospective

Executable head `2873d94` passed all 39 build targets, quality with 1481 tests in 105 files, the focused launcher checks and all 22 startup tests. A fresh committed checkout materialized new node_modules and built the actual production archive; shared Nix/pnpm download stores were warm. The public dev command opened its README, a real non-Bazel source, and a real Bazel source on owned virtual X11 in approximately 15, 16 and 19 seconds. The controlled wrapper remained untouched until deliberate Build, then ran once. Actual public-command negative cases preserved an occupied listener and rejected a missing target before dev output existed. The local Ditz branch fetch yielded 147 real YAML records. No managed model turn, standalone installer, untested architecture or unmerged peer view is claimed.

## Context and Orientation

`tools/dev.sh` is the Bazel development entry. The internal dev script runs Vite and Electron; `app/main` selects the local-core repository. `flake.nix` and `pnpm-lock.yaml` pin tools and dependencies. `tools/virtual-desktop-run.sh` owns isolated X11 automation. The distributable archive currently produced by `tools/build-app.sh` must be inspected before documenting its runtime boundary. Ditz task data lives on a separate Git branch, not in the source tree.

## Plan of Work

First inspect the existing dev process and repository registration. Add only focused argument parsing and propagation from the public launcher to main, preserving all safety boundaries. Add regression tests for default, relative, absolute, missing and non-repository paths and occupied-port reporting. Then add `tools/demo-install` as a Bazel-owned installation proof that uses a disposable checkout and second repository, never the physical desktop. Finally document exact prerequisites, materialization, launch, boundaries and a tour of verified features in README.md and docs/demo.md.

## Concrete Steps

From this worktree run `nix develop --command pnpm install --frozen-lockfile`, use Bazel with `--jobs=3` for focused tests and production bundle, and run the new installation proof while holding the shared virtual-desktop lock. Normal human launch is `SWARM_DEV_PORT=55173 nix develop --command bazel run --jobs=3 //:dev -- --workspace /absolute/path/to/repo`. Record exact proof commands and observations after execution.

## Validation and Acceptance

A new disposable checkout at a different path must materialize dependencies without private temp paths, start the actual UI, and open a committed file in a second disposable non-Bazel repository. `nix develop --command bazel run --jobs=3 //tools/demo-install:smoke` now performs this plus a controlled Bazel wrapper case. The UI must report unavailable build evidence honestly. Invalid workspace and occupied loopback port must produce actionable errors without starting another app. Ditz branch availability is verified through the explicit local-ref fetch. Screenshots and logs distinguish warm shared dependency caches from fresh checkout state. Native OpenAI and Google original/delta seats reached CLEAN; Sonnet's one 240-second attempt returned no review and remains unfilled. No replacement seat or retry was used. One meaningful local gate is sufficient; hosted CI is ignored under release authority.

## Idempotence and Recovery

Tests create uniquely owned temporary directories and processes. Cleanup targets only those owned processes; preserve evidence and worktrees. The selected user repository is not initialized, altered or overwritten by the launcher. Failures stop with an explicit error, not a different implicit workspace or port.

## Artifacts and Notes

Operational evidence and concise integration notes live in the assigned step directory; distributable docs contain no private session paths or raw transcripts. Pending peer features stay out of publish-ready copy until ROOT verifies integration.

Final executable proof is under `artifacts/demo-install/run.7x4R5K`: installation inputs, public-entry rejection evidence, source screenshots, explicit-wrapper authority and per-case cleanup records. It uses native input/window titles and visually inspected source screenshots, not fixture injection or a renderer-error instrumentation claim. All three observed cleanup records report completion; the owned checkout Bazel server was also shut down. Temporary evidence checkouts are retained, not installed into a user repository.

## Interfaces and Dependencies

Use the existing pinned Node/Nix/Bazel/Electron tools and current typed local-core registration. Do not add dependencies, change the lockfile or flake, activate providers, or alter admission policy. B1 owns dynamic build queries, H1 external-agent registration, and V1 plan/task navigation; their implementation is not a dependency of this delivery increment.

Initial plan records bounded assumptions and acceptance before implementation.

2026-09-07 revision records implemented behavior, exact review finding/correction, frozen local proof and remaining normal landing. This avoids crediting the failed mutable-script aggregate or expanding the supported runtime boundary.
