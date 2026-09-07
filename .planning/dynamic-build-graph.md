# Observe the current repository's Bazel graph

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Opening Build graph must show dependencies queried from whichever repository is registered, not a historical capture tied to one worktree path. Users can refresh the observation and see retained data marked stale while relevant inputs change. This observes Bazel declarations; it does not assert successful compilation or deployment.

## Progress

- [x] (2026-09-07) Verified clean `feature/dynamic-build-graph` baseline e8ec0f9 and consumed exact assignment.
- [ ] Implement bounded typed query/cache and tests.
- [ ] Connect existing graph, directory links and Context without resetting navigation.
- [ ] Prove actual two-repository packaged edge changes and retention on owned virtual desktop.
- [ ] Council convergence, one frozen local full gate, normal landing or precise base hold.

## Assumptions and Failure Modes

The core owns an already registered local repository. Bazel is provided by the configured environment. Repositories without a supported Bazel root are unavailable, not empty graphs. Repository-controlled BUILD/Starlark may fail, stall or produce excessive output; all query work needs finite process, byte and graph bounds. Renderer input cannot choose executable, cwd or query text. Repository identity and input generations fence concurrent results. A retained graph is never labelled current after a failed refresh or moved input. Source file contents do not themselves determine dependency declarations, but new or removed filenames can affect globs. Conservative bounded input scans are acceptable; undocumented omniscient change detection is not.

## Context and Orientation

`app/renderer/App.tsx` imports a path-bound capture from `fixtures/ui-build-links.snapshot.json`. Existing `app/renderer/repository/BuildGraphPane.tsx` and `build-view.ts` provide graph cameras, Follow file and target pattern selection. `protocol/schema.ts` validates the public bridge, `core/worker-runtime.ts` dispatches requests, and the Electron main/preload bridge transports them. A new focused core module will query Bazel and retain one repository's observation. A renderer hook will request it only while a consumer needs data and expose explicit refresh. No historical capture is used by production after this change.

## Plan of Work and Milestones

First add an additive request/result contract for a build-graph observation with explicit status, coverage, input identity and graph nodes/edges. Implement fixed-grammar bounded Bazel querying with a privately owned output location, parsing node kinds rather than guessing file extensions. Controlled tests cover malformed/large output, isolated nodes, out-of-order completion, errors, disposal and input movement.

Then connect the existing graph and link consumers to the observation through one renderer hook. Preserve mounted graph instances and selection/camera/source/draft state. Dirty/error states retain the previous observation with truthful labels and a Refresh/retry affordance. Refresh triggers are demand activation, explicit refresh and bounded observation of relevant definitions and filename membership; no query follows ordinary cursor movement.

Finally add a dedicated `tools/build-graph` proof that creates two real Bazel repositories, opens ordinary packaged UI, changes a BUILD dependency, and verifies an edge appears/disappears without capture identity tricks. Existing D6 task/rehearsal tooling is excluded. Record screenshots, freshness, retention and strict zero renderer exceptions. Run council to fixpoint before one final frozen full local build/test execution. If remote master moved beyond the approved base, hand ROOT exact reviewed heads rather than consuming peers.

## Concrete Steps

All project commands run in `/home/tedks/Projects/swarm-ide/dynamic-build-graph` through `nix develop --command`. Materialize dependencies with `pnpm install --frozen-lockfile`; use `bazel test //tools:quality --jobs=3` for focused implementation checks. Build and test only through Bazel. Final commands are `bazel build //... --jobs=3` and `bazel test //... --jobs=3 --nocache_test_results`; GUI/full tests hold `/tmp/swarm-ide-overnight.UgO2Aw/virtual.lock` with `flock --close`. Desktop proof must own virtual X11 :90 and port55174, never the physical display.

## Validation and Acceptance

Actual repository A has two packages and a dependency. Build graph displays both rule nodes and the edge, including isolated rules. Editing the dependency definition marks the observation stale and a bounded refresh yields the changed graph. Repository B obtains its own graph and cannot reuse A's identity or data. Missing Bazel roots, failed/timeout/malformed query output and limits have explicit non-current states. Refresh/hide/reactivation must retain graph cameras and dirty editor/draft. Every historical/synthetic observation remains labelled separately from actual packaged evidence.

## Idempotence and Recovery

Use owned temporary query/proof directories and processes only; never kill shared Bazel servers or modify shared previews. Preserve this worktree, branch and step evidence. Refresh coalesces duplicate work and cancellation/disposal cannot publish late results. Normal PR merges preserve history. No direct master push, rebase, force push, hosted CI work, credentials or model activation.

## Interfaces and Dependencies

Use existing TypeScript, Zod, Node child-process/filesystem and Bazel facilities only. Add no package dependencies. The request selects only the registered repository/world and refresh intent. Query grammar and executable remain core constants. Renderer consumes a runtime-validated observation and adapts it to the existing graph view; observations distinguish query provenance from binary build status.

## Decision Log

- Decision: one end-to-end PR, no separate design department or platform rewrite. Rationale: tonight's working-repository demo needs visible useful behavior quickly. 2026-09-07, B1.
- Decision: repository-scoped observations, never a global capture cache. Rationale: same labels in different roots are different evidence. 2026-09-07, B1.

## Surprises & Discoveries

The shell does not expose ripgrep outside Nix; initial discovery used ordinary filesystem tools. No product finding yet.

## Artifacts and Notes

Step evidence lives at `/tmp/swarm-ide-build-graph-b1.MFmmXC`; `consumed.md` records initial state. Raw test/council and packaged evidence will be linked here as produced.

## Outcomes & Retrospective

Implementation in progress; no live query or packaged proof claimed yet.

Initial plan written before implementation to name authority, input and lifecycle assumptions.
