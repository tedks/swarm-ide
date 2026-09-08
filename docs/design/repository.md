# Repository projections and contextual information

Repository navigation answers where code lives. The build graph answers what
includes or depends on it. Service topology answers how declared interfaces fit
together. Context puts useful facts and links beside the selected item without
collapsing these distinct questions into one graph.

## Lower-level map

| Projection | Producer | Consumer |
| --- | --- | --- |
| Directories and filename search | [repository.ts](../../core/repository.ts), [repository-search.ts](../../core/repository-search.ts) | [RepositoryNavigation](../../app/renderer/repository/RepositoryNavigation.tsx) and search palette |
| Bazel rule/input dependencies | [build-graph.ts](../../core/build-graph.ts) | [BuildGraphPane](../../app/renderer/repository/BuildGraphPane.tsx), Context target membership |
| Declared services/interfaces | [service-topology.ts](../../core/service-topology.ts), [provider.ts](../../core/provider.ts) | Service graph and declaration navigation |
| Selected facts and links | [context/compose.ts](../../app/renderer/context/compose.ts) | [ContextPane](../../app/renderer/context/ContextPane.tsx) |
| Change observation | [working-world-observer.ts](../../core/working-world-observer.ts), [watchers.ts](../../core/watchers.ts) | Invalidates or refreshes derived observations |
| Local servers and containers | [project-context/provider.ts](../../core/project-context/provider.ts) | [ProjectContextPanel](../../app/renderer/project-context/ProjectContextPanel.tsx), automatic worktree-scoped runtime instruments |
| Registered agent worktrees | [worktree-inspection.ts](../../core/worktree-inspection.ts) | [AgentWorktreeBrowser](../../app/renderer/AgentWorktreeBrowser.tsx), read-only directories, changed paths and master comparison |

The Bazel graph uses an actual per-repository query rather than a hardcoded demo
directory. Explicit observation/refresh and working-world changes govern its
cache. A target with no dependency edges is still a target. Query results are
not compiled binaries and do not mean a deployment exists.

Service topology needs a registered declaration/artifact; a plain repository
does not magically acquire services. A build failure retains the last topology
with its status. Context shows direct/indirect target membership and compact empty
states. Example latency is illustrative unless an actual measurement source is
connected; build resource observations and service deployment facts have their own
sources. See [context metrics](../context-metrics-demo.md).

[Automatic runtime context](../project-context.md) separately discovers actual
Node listeners and Compose-owned containers. Process/socket identity and exact
canonical worktree metadata establish ownership; neither filenames nor familiar
container names do. Cloud deployment and telemetry adapters remain planned.

## Agent worktree exploration

The standalone agent worktree browser reads the selected session's canonical
`contextRoot` from the private registry. It does not replace the ordinary editor
or rebind the graph cameras. Its App mount belongs to the conversation cockpit;
the original editable workspace must stay mounted while the browser is visible.

`worktree.browse` reuses the bounded directory reader and lists tracked changes
against the first available local reference in this order: `origin/master`,
`master`, `origin/main`, `main`. The actual branch and chosen base are displayed.
Each operation resolves that reference once before querying its comparison;
there is no fetch, checkout, staging, or index update. Both committed agent work
and current local changes appear. Untracked files are separate, renames retain
their old path, and missing bases or partial results are not called clean.
At most 400 changed paths are displayed; directory browsing remains available.
The browse operation has one four-second cancellation budget, below the normal
five-second bridge deadline. Rename inspection carries both literal paths.

The existing `worktree.inspect` request retains HEAD comparison by default;
the browser explicitly requests master comparison. Files are read through the
same source broker as ordinary inspection. Deleted files show their diff;
binary or oversized files have no source preview. Directory links, nested
repositories, and Git administration are not traversed. This is a read-only
explorer, not a second editable workspace or a whole-graph repository switch.

## Build connections

The producer, protocol and renderer modules enter `//:quality_sources`, which
feeds `//:desktop-bundle`. In [tools/build-graph/BUILD.bazel](../../tools/build-graph/BUILD.bazel),
`//tools/build-graph:packaged-build-graph-test` consumes that bundle plus query
test sources and the owned virtual-desktop driver. It exercises real disposable
Bazel repositories; it is not the application build graph itself.

The current service examples have their own declarations under
[checkout-world](../../examples/checkout-world/services/payments/BUILD.bazel).
Their labels describe example services, not Swarm's TypeScript component
boundaries. See [dynamic build graph](../dynamic-build-graph.md) for query limits.

## Target and file links

Context's direct and indirect target rows carry exact build-graph identities.
An explicit click supplies the observation's repository and revision to
`BuildGraphPane`; this switches out of file-follow mode and reveals the selected
target. Unrelated service and repository graph instances stay mounted. The
declaration action uses the target's recorded `buildFile`, whether `BUILD` or
`BUILD.bazel`; old captures without declaration paths cannot invent one.

[The reference resolver](../../app/renderer/bazel-reference.ts) handles simple
literal strings on Alt-click in Bazel sources. BUILD files accept observed
absolute labels, `:target`, and package-relative source names. Starlark macros
may interpret relative strings in their caller's package, so `.bzl` files accept
only absolute `//package:target` labels for now. Generated/external targets,
computed strings, ambiguous records and absent observations are not followed.
The normal source broker still controls opening and dirty-buffer handoff; the
resolver does not read the filesystem or choose another agent's worktree.

`//tools/context-source-links:unit` consumes `//:quality_sources` and checks the
literal resolver, editor gesture, both Context categories and explicit graph
selection. App's small callback mounts are coordinated with the conversation
owner; until that joined mount lands, the additive component APIs alone do not
make these gestures available in the running application.

`//tools/worktree-browser:checks` consumes `//:quality_sources` and checks the
actual two-worktree Git broker plus mounted browser and original-buffer retention.
`//tools/worktree-browser:smoke` packages the production core and places the real
App and browser in a labelled controlled renderer wrapper on owned virtual X11.
That wrapper proves retention before the independent conversation-owner App mount;
it is not a live-agent or normal-entry-point claim.
