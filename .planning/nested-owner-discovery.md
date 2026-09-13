# Repair nested owner discovery and high-count project refresh

This living ExecPlan follows `.planning/PLANS.md` and stays limited to the registration/discovery boundary described below.

## Purpose / Big Picture

Swarm IDE should automatically recognize the one interactive Codex CLI behind an explicitly selected tmux pane even when that process also holds transcripts for nested native helpers, and an already-open observer should continue discovering agents after a repository grows beyond 128 Git worktree records. A user can see the repair through owned tests that select the exact CLI transcript among nested helpers and discover a later tmux pane in a real disposable high-count worktree repository.

## Progress

- [x] (2026-09-13 06:09Z) Read the task packet, repository instructions, existing discovery/refresh code, focused tests, design mapping, and the two started Ditz issues.
- [x] (2026-09-13 06:14Z) Added sanitized nested-helper selection and ambiguity regressions, including a helper whose intermediary transcript is not open.
- [x] (2026-09-13 06:14Z) Removed aggregate worktree-count rejection, retained deadline/cancellation, and reduced identity validation from two Git subprocesses to one per accessible worktree.
- [x] (2026-09-13 06:14Z) Extended the owned Git/tmux reconciliation proof to 130 real disposable worktrees; focused registration and CLI targets pass.
- [x] (2026-09-13 06:17Z) Opened draft PR #154 from pushed commits `b81ac83d` and `5461fb7b`.
- [x] (2026-09-13 06:20Z) Aligned living runtime design and `.swarm/plans.json` source/Bazel descriptions.
- [x] (2026-09-13 06:20Z) Built the CLI registration bundle and performed the single permitted read-only live confirmation: corrected automatic discovery selected the known root session and rollout from pane `%179` with current PID/start identity.
- [ ] Complete final focused gates, review to fixpoint, and prepare clean pushed ROOT intake.

## Surprises & Discoveries

- Observation: automatic owner selection currently rejects every helper that is not a direct child of the unique `source: "cli"` header, although final authority is independently proven by exact pane, process PID/start time, and open rollout validation.
  Evidence: `tools/session-registration/identity.ts::interactiveCandidate` compares every native `parent_thread_id` directly with the CLI session ID.
- Observation: recurring project refresh rejects raw records before filtering and also launches two Git subprocesses for every admissible worktree, while startup accepts the same aggregate without a numeric cap.
  Evidence: `tools/cli/project.mjs::refreshProject` defaults `maxWorktrees` to 128 and then calls both `rev-parse --git-common-dir` and `rev-parse --show-toplevel` per record.
- Observation: the owned end-to-end fixture creates and refreshes 130 real worktrees quickly enough to stay well inside the existing deadline after the redundant Git probe is removed.
  Evidence: `//tools/session-registration:unit` passed its 130-worktree late-pane reconciliation as part of 81 tests in 23.9 seconds total, including a separate five-second lock-contention case.
- Observation: the sanitized reproduction matches the live failure mode rather than only a fixture assumption.
  Evidence: the corrected `//tools/cli:registration-bundle` returned session `01a0702a-7b5e-71e0-bb62-287d55a7f9ba`, PID `3690953`, process start `470496407`, and `rolloutMatchesExpected: true` for the known pane; no transcript content or registry write was performed.
- Observation: council round 1 found that the initial single common-directory probe did not prove an exact worktree root, default Zod object parsing was not a strict variant check, and strictly sequential probes unnecessarily limited scaling.
  Evidence: the correction requests common directory and top level in one process, checks at most eight paths concurrently, rejects mixed source variants and open helper cycles, and passes both focused targets.

## Decision Log

- Decision: identify exactly one CLI header and require every other unique same-process candidate to have the strict native-helper source shape, without reconstructing transcript graph parentage from whichever descriptors happen to remain open.
  Rationale: open descriptors are a live process-membership sample, not a complete ancestry database. Present helper links are checked transitively for cycles, but a missing intermediary is allowed. Multiple CLI headers, mixed source variants and any unknown/non-native peer remain ambiguous; exact live handoff validation remains the authority check.
  Date/Author: 2026-09-13 / Codex
- Decision: remove the aggregate worktree-count option and validate refresh membership from the exact canonical common directory's own bounded `git worktree list --porcelain -z` result, checking repository identity and exact top level in one Git process per non-bare, non-prunable accessible path with at most eight probes active.
  Rationale: the listing command has an 8 MiB output bound, each worktree retains its exact-root proof, and bounded concurrency plus cancellation and a total deadline govern resource use. A raw count is neither an identity check nor a useful resource bound.
  Date/Author: 2026-09-13 / Codex

## Outcomes & Retrospective

Implementation is complete and the focused tests plus one bounded live read-only identity check pass. Review convergence and final landing hygiene remain.

## Context and Orientation

`tools/session-registration/identity.ts` scans only one named tmux pane, bounded process descendants, and owned rollout descriptors. When more than one rollout is open in the same process, `interactiveCandidate` reads and stably revalidates each bounded header before selecting a CLI candidate; `validateHandoff` then independently proves the exact socket/window/pane/PID/start/open-file tuple. Header selection must not create or rewrite parent links stored in transcripts or the registry.

`tools/cli/project.mjs::refreshProject` periodically updates the set of worktrees admitted to automatic tmux observation. Its selected `project.identity` is the canonical Git common directory fixed at startup. `git worktree list` run from that identity is the repository's authoritative membership listing; bare, prunable, missing, inaccessible, and noncanonical paths stay excluded. `tools/cli/tmux.mjs` then validates an observed process's current root against that refreshed set and preserves historical rows when a scan is inconclusive.

## Plan of Work

First extend `tools/session-registration/registration.test.ts` fixtures so one process holds a CLI rollout plus nested-helper rollouts whose source metadata point through another helper, including a deliberately absent intermediary descriptor. Update `interactiveCandidate` to separate unique CLI selection from strict native-helper classification while preserving same-process checks, unique IDs, header inode/content revalidation, exact-rollout behavior, multiple-CLI rejection, unknown-source rejection, cancellation, and final handoff validation.

Next update `refreshProject` and `tools/cli/project.test.mjs` to remove the arbitrary record-count contract. Keep canonical identity, exact root, path accessibility, bare/prunable filtering, abort propagation, the total deadline, and bounded Git commands. Combine each path's common-directory and top-level query in one process, scheduled through a small worker pool. Extend the existing owned late-worktree tmux integration test so refresh crosses 128 real Git worktree records and adopts a later pane without touching live tmux or user worktrees.

Finally update `docs/design/runtime.md` and the affected `design:agents`/`design:runtime` descriptions in `.swarm/plans.json` so source paths, Bazel targets, and behavior match. Run `//tools/session-registration:unit`, `//tools/cli:checks`, and the CLI registration bundle/build. Run the requested provider-aware council review to a clean convergence round, recording unavailable seats without substitution.

## Concrete Steps

All commands run from `/home/tedks/Projects/swarm-ide/live-tmux-discovery`:

    nix develop --command bazel test //tools/session-registration:unit //tools/cli:checks
    nix develop --command bazel build //tools/cli:registration-bundle

The session-registration target owns the disposable Git/tmux end-to-end proof. No GUI launch, live app mutation, transcript scan, model turn, worktree deletion, or all-repository test sweep is part of this plan.

## Validation and Acceptance

The focused tests must demonstrate that automatic lookup returns the exact CLI rollout when direct and nested native-helper headers share its process, even when a nested helper's immediate parent descriptor is absent. It must return no candidate for multiple CLI roots, duplicate identities, unknown or ordinary unrelated headers, mixed processes, changed headers, cancellation, deadline failure, or failed exact handoff. Exact known-rollout lookup must remain valid independently.

The refresh tests must demonstrate more than 128 real disposable worktree records, a later pane rooted in one of those worktrees, successful checked registration on reconciliation, and retained cancellation/deadline/liveness behavior. Bare, prunable, missing, and inaccessible listing entries remain excluded. Focused Bazel targets and the bundle build must pass.

## Idempotence and Recovery

Tests create only private temporary repositories, sockets, processes, and worktrees and clean those owned fixtures. Repeating refresh is read-only and repeating reconciliation is idempotent. Any implementation failure can be corrected on this feature branch without changing the live demo, Goals, private registry, user processes, or existing worktree inventory.

## Artifacts and Notes

The required readiness receipt and task-local `seam.md`, `status.md`, `verification.md`, and `final-recap` live under `/tmp/swarm-ide-nested-discovery.4MT5gM/` and contain no private transcript contents.

## Interfaces and Dependencies

No new protocol, core, renderer, package, or provider interface is introduced. `discover(input, knownRollout?)` and `refreshProject(project, environment, signal, dependencies?)` retain their public result shapes. The refresh dependency object keeps `runGit` and `timeoutMs`; the obsolete `maxWorktrees` test-only option is removed. Existing Node filesystem/process primitives, Git, tmux, Zod header validation, and `validateHandoff` remain the only dependencies.

Plan created before implementation to record the two independent causes, the security assumptions that preserve exact authority, and the focused proof required for ROOT adoption.

Updated after implementation and council round 1 to record live proof, exact-root and strict-variant corrections, bounded concurrency, and the reason the implementation differs from the initial per-entry validation sketch.
