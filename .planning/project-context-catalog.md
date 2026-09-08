# Recognize the project behind its processes

This ExecPlan follows `.planning/PLANS.md`. Keep progress, discoveries, decisions and outcomes current.

## Purpose / Big Picture

Opening a repository should reveal its components, development servers, dependency connections and configured publication destinations without a Swarm-specific config file. The first project-context increment already supplies exact-worktree Node and Docker observations. This continuation recognizes Python and Hugo servers, nested build roots and the component manifests found in the user's actual projects. It keeps configured architecture separate from measured runtime state. An Electron application's private web server is not advertised as a browser version of the application.

## Progress

- [x] (2026-09-08) Inspected PredictionBook, Pairmarket, Chaos/Speech, discord-agents, slowed and website using read-only native helpers; reported findings to the user and implementation plan to ROOT.
- [x] (2026-09-08) Confirmed PR94 merged; continuation uses its unchanged reviewed source base in the same designated worktree and a new PR.
- [ ] Extend runtime discovery and prove Electron exclusion plus nested Python/Hugo behavior.
- [ ] Implement bounded manifest catalog and declared component relationships/sites.
- [ ] Connect the catalog through the existing provider and dedicated panel without changing focus or App mounts.
- [ ] Run proportional focused/native checks and one actual owned packaged user path; update design mappings, Ditz and ROOT handoff.

## Surprises & Discoveries

PredictionBook's launch-readiness worktree is newer than master and uses Sui gRPC plus an explicit chain/deployment identity contract. Pairmarket's API and wallet are currently libraries, not HTTP daemons. Slowed exists as an initialized submodule under the tedks checkout and its build root is nested one directory further at slomix. Website is Hugo and publishes two distinct sites from shared source. Discord-agents' health method includes a disk preflight and payload details, so this continuation must not blindly call it as a harmless metrics endpoint.

## Decision Log

Use tool/manifests, not project names, for default instruments. A manifest declares a component or URL, not a running service, successful test or deployed revision. Do not execute package scripts, import repository JavaScript, read environment/credential files, collect customer records or modify the scanned projects. New cloud/chain measurements require a separately verified read adapter; do not fill those gaps with guessed values. Generic workload statistics from already observed processes can be extended later without pretending manifests contain job counts.

The first reviewable continuation implements broadly applicable local runtime and declared architecture first. Existing app-specific counters (render queue, Discord gateway, Walrus expiry) remain concrete follow-ups where they need new safe telemetry interfaces. This keeps the increment useful without inventing those live integrations.

## Outcomes & Retrospective

Implementation in progress. PR94 remains independently complete; this continuation does not change its historical evidence or delay adoption.

## Context and Orientation

`core/project-context/node.ts` owns Linux process/socket reads and exact Bazel-output association. `core/project-context/catalog.ts` will discover allowlisted manifests within the opened worktree. `protocol/project-context.ts` gains an optional catalog so old observations still validate. `core/project-context/provider.ts` joins independent timestamped observations and retains original timestamps when a detector is temporarily unavailable. `app/renderer/project-context/ProjectContextPanel.tsx` owns the existing panel and its ten-second refresh. No new App layout or protocol route is needed. `tools/project-context:checks` is the focused Bazel test target; its source inputs already include this package and root source group.

## Plan of Work

Extend the existing process detector by recognized executable family, preserve process/start/socket checks, and locate bounded nested Bazel aliases with exact source backlinks. Exclude desktop-shell private Node endpoints from browser suggestions by package metadata rather than repository name.

Add a bounded manifest catalog returning components, workflow names, exact local dependency edges and configured site links. Read ordinary allowlisted source files only, skip generated/dependency trees, report clipped or malformed coverage, reject escaping symlinks and nonregular inputs. Node package relationships, Move local dependencies, Hugo sites, Python packages, OCaml and Bazel markers establish useful defaults without per-repository configuration. Unsupported dynamic JavaScript remains unsupported rather than executed.

Join catalog observations independently of runtime availability and render compact Components, Connections and Sites sections. Show sites as configured destinations; never turn them into health badges. Keep old catalog rows only within the same provider identity with their original observation time. Update repository/runtime design docs and graph source mappings.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/project-context`, branch `feature/project-context`. Use `nix develop --command pnpm install --frozen-lockfile` for dependency materialization and `nix develop --command bazel test //tools/project-context:checks --jobs=3` for types and focused tests. Build `//:desktop-bundle` and run `//tools/project-context:packaged-test` with an unused owned virtual display/port. Never automate physical :0 or modify the shared preview.

## Validation and Acceptance

A real disposable Python HTTP listener appears with its actual link; a declared Hugo site appears as a configured site, not observed deployment. Ordinary Electron internal servers do not appear as browser applications, while separately owned web packages remain visible. Deterministic tests cover malformed/oversized metadata, missing tools, nested roots, unrelated worktrees, stale replies, cancellation and finite coverage. A late observation for one repository cannot populate another. Native review checks actual code and corresponding design mappings; no broad historical suite or foreign-provider review is required under current user directions.

## Idempotence and Recovery

Discovery only reads. Repeated observations coalesce and have finite deadlines; no per-project setup, background daemon or external mutation occurs. The new protocol field is optional for legacy observations. Keep all commits recoverable, push often, leave normal merge and app adoption to ROOT. Test-created processes, repositories and virtual desktops have explicit owned cleanup.

## Artifacts and Notes

The continuation plan and status are also summarized in `/tmp/swarm-ide-project-context.4Mi48a/continuation-plan.md`; final evidence will distinguish source-derived configuration from actual runtime observations and unimplemented integrations.

## Interfaces and Dependencies

`discoverProjectCatalog(root, signal)` returns the bounded `ProjectCatalog` type: components (manifest identity, family, workflows), relationships (source component, destination and evidence path), configured sites and scan status. Provider construction adds an injectable catalog detector for deterministic tests. Existing Zod/Node libraries suffice; no new dependency, process launcher or general plugin framework is required.
