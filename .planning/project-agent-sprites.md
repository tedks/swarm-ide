# Show project agents across every graph without losing worktree truth

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept current while implementation proceeds. Maintain this document in accordance with `.planning/PLANS.md`.

## Purpose / Big Picture

An operator looking at the primary branch should be able to see every registered local agent working in any linked worktree of the same Git project. Looking at a feature worktree must narrow that view to the exact worktree. Every repository, service, build, component, plan, and task projection must either place an eligible agent using explicit domain membership or show that agent in a small “unplaced” row. Selecting either a sprite or an unplaced agent must open the exact existing conversation without changing graph selection or camera state.

The implementation must preserve an important distinction: graphs and source bytes always describe the selected worktree. A sprite from a sibling worktree reports where that agent last touched the same repository-relative path; it does not claim that the sibling edit exists in the primary branch. An unrelated repository, an unknown Git identity, a detached worktree, prose that merely resembles a path or task, and a build dependency with no direct source membership must never create placement.

## Progress

- [x] (2026-09-10 15:50Z) Read the authorization, common safety boundary, repository instructions, and `.planning/PLANS.md`; confirmed the clean designated worktree and branch; wrote the required ready note.
- [x] (2026-09-10 16:05Z) Mapped the current workspace contract, external observer, graph overlay, graph surfaces, tests, live-sprites proof, living design documents, and Bazel source mappings.
- [ ] Add a focused regression that demonstrates the current exact-root filter omits a sibling-worktree agent in primary scope, and record the failing result before implementing the correction.
- [ ] Publish bounded canonical Git-family identity, branch identity, and explicit project-versus-worktree sprite scope from the privileged core.
- [ ] Separate eligible from placed agents, retain exact origin identity, and expose eligible-but-unplaced conversations on every graph layer.
- [ ] Add exact membership adapters and mounts for the plan hierarchy, component/design projection, component build-mapping projection, and task graph while preserving existing repository, service, and build behavior.
- [ ] Extend the owned two-worktree packaged proof with multiple visible graph assertions and no model turn.
- [ ] Align `docs/design/graph-agent-locations.md`, related living design text, `.swarm/plans.json`, and Bazel inputs with the delivered behavior.
- [ ] Run focused checks, type/build gates, the bounded packaged proof, and proportional council review to a clean convergence round; address or file every finding.
- [ ] Commit and push all reviewable increments, update the Ditz issue without closing it, sync metadata, mark the draft PR ready, verify branch/remote state, and write `verification.md`, `seam.md`, and `final-recap` in the authorized step directory.

## Surprises & Discoveries

- Observation: the current renderer admits an agent only when both summary and detail `worktree` fields equal the selected root, so the primary branch cannot show a sibling-worktree agent even though its repository-relative event path could map to the primary graph.
  Evidence: `observedGraphAgents` in `app/renderer/graph-agents/locations.ts` performs both hard equalities before resolving the event path.
- Observation: `core/workspace-context.ts` already proves two selected roots share the same canonical Git common directory, but discards that identity, while `tools/cli/project.mjs` already treats the canonical common directory as the project-family authority.
  Evidence: both modules call `git rev-parse --path-format=absolute --git-common-dir`; the launcher hashes that canonical path for its private project key.
- Observation: `ProjectionCanvas` already renders `GraphAgentSprites` inside each node. Plan hierarchy and task graph therefore need a surrounding membership layer, not new node rendering or camera ownership.
  Evidence: the node label assembled in `app/renderer/plans/ProjectionCanvas.tsx` includes `GraphAgentSprites` and its memoized graph arrays exclude agent observations.
- Observation: the authored component build-mapping projection contains Bazel labels and label-to-label relations but no source-file-to-target association. It can truthfully expose eligible agents as unplaced; it must not assign component source paths to arbitrary build targets.
  Evidence: `PlanNode.design.buildTargets` in `protocol/plans.ts` records labels, roles, and dependency labels only.

## Decision Log

- Decision: derive one opaque project identity by hashing the canonical Git common-directory path in a small privileged core helper, and publish only the digest plus canonical worktree root and branch.
  Rationale: linked worktrees need stable equality without exposing the host’s Git administration path to the renderer. Canonical labels, folder names, repository IDs, and the router’s launch-runtime flag are not shared-family authority.
  Date/Author: 2026-09-10 / Codex
- Decision: publish an explicit workspace sprite scope. A checked-out branch receives project scope only when it equals the repository’s resolved default branch; missing Git identity, detached HEAD, or unresolved default branch remains exact-worktree scope.
  Rationale: the launch workspace can itself be a feature worktree, so router ownership cannot safely imply a God’s-eye view. Conservative narrowing prevents accidental mixing.
  Date/Author: 2026-09-10 / Codex
- Decision: keep one eligible-agent model whose last path is nullable, then derive placement independently for each graph’s currently mounted node membership.
  Rationale: pathless, outside-root, trimmed-tail, and branch-only agents remain reachable without inventing a node. Graph-specific filtering prevents an agent placed on a hidden node from silently disappearing.
  Date/Author: 2026-09-10 / Codex
- Decision: allow task placement only through exact task IDs or canonical file references already present in the current task snapshot/details. Allow component placement through authored source/docs paths and exact `PlanNode.taskIds`.
  Rationale: these are explicit typed memberships. Free-form task prose, ancestry, directory proximity, and transitive dependency inference are not.
  Date/Author: 2026-09-10 / Codex

## Outcomes & Retrospective

Implementation is in progress. At completion this section will state exact shipped surfaces, test counts, packaged evidence, unresolved limitations, and any follow-up issues.

## Context and Orientation

The Electron renderer in `app/renderer/App.tsx` owns one `GraphAgents` context around the workbench. Today it passes only the selected worktree root. `app/renderer/graph-agents/locations.ts` combines `ExternalAgentSummary` rows with bounded `ExternalDetail` activity, selects the newest recorded tool event carrying a typed path, and maps its path into domain-specific graph nodes. `app/renderer/graph-agents/GraphAgents.tsx` renders per-node buttons through a nested `GraphAgentLayer`; `app/renderer/graph-agents/graph-agents.css` presents them without adding graph nodes or edges.

The typed workspace descriptor is `WorkspaceSelection` in `protocol/workspace.ts`. `core/workspace-context.ts` creates it for the launch worktree and for a registered agent worktree. The latter path already compares the canonical Git common directory of both roots. The external observer in `core/external-agents.ts` validates private registry entries and canonical registered worktree roots, then publishes summaries through `protocol/external-agents.ts`. The renderer receives no registry path and performs no Git query.

Repository and service projections live in `app/renderer/GraphPane.tsx`; the direct-source Bazel graph is in `app/renderer/repository/BuildGraphPane.tsx`; plan and component graphs are in `app/renderer/plans/PlanHierarchy.tsx`, `DesignWorkspace.tsx`, and `ProjectionCanvas.tsx`; the Ditz dependency graph is in `app/renderer/tasks/TaskGraph.tsx`. A “membership” is an explicit typed relationship between a graph node and a repository-relative file path or task ID. Placement changes only the overlay; it does not add a graph node, graph edge, or movement history.

The implementation is built and tested only through Nix and Bazel. `//tools/live-sprites:checks` owns the focused overlay suite. `//tools/live-sprites:smoke` launches a packaged desktop in a disposable virtual X11 session and must never target physical display `:0`, use the live Goals registry, send a message, or start a model turn.

## Plan of Work

First, add the primary-scope sibling-worktree expectation to `tests/graph-agent-locations.test.ts` and run the focused Bazel target to preserve evidence that the old exact-root behavior fails. Then add `core/git-worktree-identity.ts`, a bounded read-only helper using the existing Git query boundary. It will canonicalize the worktree top level and common directory, hash the common directory into an opaque project ID, read the exact symbolic branch, and resolve the default branch using the remote default followed by the common repository’s own `HEAD`. It will return no widening authority when any required identity is unavailable.

Extend `WorkspaceSelectionSchema` with the opaque project ID and explicit agent-visibility scope. Make `resolveWorkspaceSelection` use the helper for both launch and registered roots and retain the existing same-common-directory rejection. Extend `ExternalAgentSummarySchema` with optional project and branch metadata so old/unavailable registrations remain representable. In `ExternalAgentService`, derive that metadata only after the registry’s canonical worktree validation. This change is additive near registration/summary construction and must avoid the lifecycle cache/propagation hunks owned by the parallel status worker.

Refactor `observedGraphAgents` to accept the selected workspace descriptor. For project scope, both summary and detail must carry the selected opaque project ID; for worktree scope, both must carry the exact selected canonical root. Always resolve a typed event path against the agent’s origin worktree and then use its repository-relative result against the selected graph. Keep eligible agents even when no valid path survives. Include the origin worktree, branch, exact session ID, lifecycle, last action, and nullable last-location data in the overlay model.

Update `GraphAgents` to expose eligible agents independently from per-layer placement. `GraphAgentLayer` will compute placement only against the nodes actually mounted in that graph and render a compact layer summary with exact buttons for eligible agents that have no mounted membership. Tooltips and accessible labels will identify origin branch/worktree and explain that location is last-observed activity, not selected-worktree source truth. Pointer and keyboard propagation guards remain on both sprite and unplaced controls. Agent updates must not enter any graph node/edge/camera dependency.

Add pure membership builders in `locations.ts`. Plan/component nodes use authored paths and task IDs. Task nodes use only current canonical backlink/detail file references and exact known task IDs. The direct build graph filters its existing direct-source memberships to the currently mounted slice. The component build-mapping projection receives an empty path membership because its schema has no path-to-target relation, but its graph layer still exposes eligible agents as explicitly unplaced. Wrap every relevant `ProjectionCanvas` with `GraphAgentLayer` and add an Agents control where one is absent.

Extend the sanitized live-sprites launcher/proof to create a primary worktree, a sibling feature worktree, and an unrelated repository in owned temporary directories. Its private registry and rollout fixtures will prove that the primary view includes same-project siblings, excludes the unrelated agent, that switching to the feature view narrows to the exact origin, and that repository plus at least two other graph surfaces expose truthful placed/unplaced state. It will perform no model turn and preserve the existing source-buffer and camera assertions.

Finally, revise `docs/design/graph-agent-locations.md`, the relevant component text and source lists in `.swarm/plans.json`, and Bazel filegroups for the new helper/proof inputs. Run the focused target after each milestone, then the broader Bazel build/test gates proportional to touched code. Push reviewable commits throughout, run the mandated provider-diverse council review to fixpoint, and record its outcome on the PR.

## Concrete Steps

All commands run from `/home/tedks/Projects/swarm-ide/project-agent-sprites`.

Create and retain the red regression evidence with:

    nix develop --command bazel test //tools/live-sprites:checks --test_output=errors

After the identity and location milestone, run:

    nix develop --command bazel test //tools/workspace-navigation:core-checks //tools/live-sprites:checks --test_output=errors

After all graph mounts and documentation are complete, run:

    nix develop --command bazel build //...
    nix develop --command bazel test //...
    nix develop --command bazel run //tools/live-sprites:smoke

The exact commands and observed results will be updated here as work proceeds. The smoke must report a packaged desktop, two same-project worktrees, an excluded unrelated repository, meaningful multi-graph assertions, retained source/cameras, zero renderer errors, and `modelTurns: 0`.

## Validation and Acceptance

The focused location regression must fail on the original implementation because a sibling agent is absent from the primary view, then pass after the implementation. Unit coverage must demonstrate primary-scope inclusion for two sibling worktrees, exact feature-scope filtering, unrelated project exclusion, detached/unknown conservative scope, path resolution against each origin root, exact click IDs, branch/worktree labels, and pathless/outside-root/trimmed agents in the unplaced row.

Graph surface tests must demonstrate mounted-node membership for repository files/directories, direct Bazel source owners, declared services/interfaces, authored plan/components, and explicit tasks. They must demonstrate no placement from build transitivity, task prose, missing refs, or component build labels without source association. Rerendering activity must preserve graph array identity and camera mount count; switching workspace or graph snapshot must immediately remove old placement.

The owned packaged walkthrough must use only disposable roots, private fixtures, an owned Xvfb/Openbox display, and owned ports/processes. It must never inspect or mutate the user’s live registry or physical desktop. A visible trusted click must open the exact registered conversation, and the existing dirty-buffer and camera state must survive.

## Idempotence and Recovery

All Git identity reads are bounded and read-only. Re-running tests may recreate only their owned temporary directories and virtual displays; their cleanup must remove those resources even on failure. The implementation makes no migration and writes no user registry. If the packaged proof fails, inspect its owned artifact directory and retry after correcting the source; do not restart the installed Goals IDE.

Commits remain granular on `feature/project-agent-sprites`. Before final handoff, pull with rebase, sync Ditz, push, prune remote tracking references, verify there are no stashes created by this session, and confirm `git status` reports the branch up to date with origin. The issue stays in progress for ROOT to land.

## Artifacts and Notes

The authorization and worker coordination artifacts live outside the repository at `/tmp/swarm-ide-agent-visibility.xuxEvL/sprites/`. Maintain `seam.md` there with the current commit, PR, checks, next action, and any overlap blocker. At completion write `verification.md` and `final-recap`; the recap and final response must begin with the exact marker required by `task-prompt.md`.

## Interfaces and Dependencies

`core/git-worktree-identity.ts` will export a bounded asynchronous function that returns a canonical root, opaque `projectId`, current branch, and default branch, or a conservative unavailable result. It will use `queryRepositoryGit`, `realpath`, and `createHash`; it will not accept renderer input or shell strings.

`WorkspaceSelection` will publish `projectId` and an `agentVisibility` enum with values `project` and `worktree`. `ExternalAgentSummary` will optionally publish the same opaque `projectId` plus its branch. `GraphAgents` will accept the complete selected `WorkspaceDescriptor`, not a guessed root.

`AgentNodeLocation` will support explicit repository-relative paths and exact task IDs. `observedGraphAgents` will return eligible `GraphAgent` values even when their `path` is null. `placeGraphAgents` will consume only those explicit membership fields. Task membership construction will accept the retained `TaskSnapshot`, loaded `TaskDetail` map, and mounted task IDs so stale or hidden data cannot masquerade as current visible membership.

No new runtime package is needed. React, Zod, Node’s existing filesystem/crypto APIs, Git through `queryRepositoryGit`, and the existing Bazel/Nix toolchain are sufficient.

Revision note (2026-09-10): created the initial self-contained plan after inspecting the authorized baseline; decisions emphasize conservative Git scope and explicit per-projection membership.
