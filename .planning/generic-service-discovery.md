# Discover the services declared by the open project

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Opening any repository should show its declared services, not compile or display a built-in checkout example. Read Compose files and `service.swarm.json` declarations, show their actual source links and declared relationships, refresh automatically, and retain the previous useful graph during a failed refresh. No Docker process, deployment or target build is needed for discovery.

## Progress

- [x] (2026-09-08) Read instructions and inventoried the fixed provider/artifact pipeline.
- [ ] Implement declaration reader, graph adapter and automatic provider observation.
- [ ] Remove shipped example and active UI/fixture assumptions; keep historical evidence.
- [ ] Verify two repositories, malformed/empty/update behavior and owned virtual desktop.
- [ ] Review, update living design, push ready PR and hand off.

## Surprises & Discoveries

The current `core/provider.ts` builds a fixed target, validates its exact source set and publishes built evidence. `core/service-topology.ts` chooses a particular implementation filename and manufactures a single-service view. Source declarations must not be published as that built evidence.

## Decision Log

Read declarations without executing project commands. Compose `depends_on` means startup ordering, not a call. Explicit native interface requirements retain their authored meaning. Declaration paths are repository-relative and must resolve within the selected worktree. Invalid files are reported, not silently replaced with fixtures. Preserve the protocol's separate built/deployed fields, adding a distinct declaration observation if needed. Keep bounded regular-file reads and finite discovery while documenting partial coverage.

## Outcomes & Retrospective

Implementation is in progress; no behavior or verification claimed yet.

## Context and Orientation

`core/provider.ts` owns working-world/service snapshots; `core/service-topology.ts` converts service metadata to graph nodes and navigation mappings. `core/worker-runtime.ts` schedules source observation. `protocol/schema.ts` validates the shared snapshot and `protocol/context.ts` currently models only a built service artifact. `app/renderer/` renders coordinated graphs and source Context. Standard Compose files are YAML; `service.swarm.json` is a JSON declaration describing a named service, its implementation paths and optional authored interfaces. All filesystem access stays in the core. Bazel query/startup and selected-target builds belong to other workers.

## Plan of Work

First build a finite declaration reader and its direct tests. Support root and discovered nested Compose/native files, resolve local declaration paths, and keep each Compose document's services scoped so names from unrelated files cannot silently merge. Then replace the fixed build/read pipeline with declaration observation, retaining source fingerprint and latest-attempt guards. Empty inputs produce no services; invalid inputs produce partial/error status with retained graph. Source observation triggers discovery without renderer polling or target compilation. Finally remove active example files and adapt UI/fixtures/tests to neutral inputs; preserve historical logs and documents marked historical.

## Concrete Steps

Work in `/home/tedks/Projects/swarm-ide/generic-services`. Use `nix develop --command bazel test --jobs=3` with the new focused target, and `nix develop --command bazel build --jobs=3 //:desktop-bundle`. Use a dedicated owned-X11 proof on display :183 and port 55443 after checking availability. Never automate :0 or edit user project sources. Start/comment/sync `swarm-generic-service-discovery` through Ditz. Commit the plan and open a draft PR, then push coherent changes and mark ready after relevant review.

## Validation and Acceptance

Two unrelated temporary Git repositories must yield only their declared services and relationships. Verify Compose startup edges are distinct from authored interface calls; no hardcoded target is launched. Test missing/invalid declarations, path escape/symlinks, changed inputs and disposal/stale attempts. Prove a valid edit changes the graph without losing an open source or graph camera. Read actual Swarm and Pure Sky declarations without starting their services. Run targeted types/tests and one owned packaged GUI proof with zero renderer exceptions and confirmed cleanup.

## Idempotence and Recovery

Changes stay on `feature/generic-service-discovery`. Disposable proof inputs and GUI belong to this worker; preserve user repositories and shared apps. Failed observations retain the prior graph with non-green status. Git history keeps removed examples recoverable. ROOT performs normal landing/adoption; no direct master writes.

## Artifacts and Notes

Concise progress and final evidence live in `/tmp/swarm-ide-startup-simple.Wz8BqH/service-discovery/`. No historical full-suite result is attributed to this new implementation.

## Interfaces and Dependencies

Use the existing YAML dependency, canonical file broker and runtime-validated graph contracts. The declaration reader returns source declarations plus explicit diagnostics and a content identity; the adapter returns a service `GraphSlice`, source `NavigationMapping`s and source provenance. Keep built service context separate. Minimal service-specific App/worker-runtime joins are authorized, with precise peer coordination.

Initial plan records the selected scope and assumptions before code changes.
