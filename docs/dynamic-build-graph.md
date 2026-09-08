# Build graph: current repository declarations

The repository has a shared real Bazel observation, available to **Build graph**,
directory **Build links** and Context. There is no production fallback
to the old Swarm-only capture. Follow file, manual target patterns, source opening
and existing graph cameras use the same observation. Context reuses an available
observation for exact declared file references; merely moving the source cursor
does not start a query.

Launch through the repository's Nix environment. It supplies the existing pinned
Bazel 7 executable and Java 21 through `SWARM_BAZEL_BIN` and
`SWARM_BAZEL_JAVA_HOME`. The core validates these fixed runtime paths; the renderer
cannot supply an executable, cwd, shell command or query. Repositories must be
registered local Git roots with regular in-repository WORKSPACE or MODULE.bazel
and build-definition files. Symlinked build definitions are explicitly unsupported
in this first slice. This is not a general Bazel version/configuration selector.

## What is observed

The fixed query is `//...:*`, using streamed Target protobuf JSON, no implicit/tool
dependencies, no user/workspace rc files, and unconfigured local package loading.
Explicit local rule/file kinds come from Bazel, not filename extensions. Isolated
rules remain visible. Declared dependencies absent from the local result remain
explicit **unresolved** targets with no invented source path. External repositories
are not expanded. A rule opens its actual BUILD or BUILD.bazel declaration.

This is **query evidence, not successful binary compilation, tests, deployment,
runtime metrics or an exclusive file-ownership claim**. Bazel's standard repository
loading still evaluates repository-controlled definitions. Declared dependencies may download automatically;
this is not a newly established network/filesystem sandbox for arbitrary untrusted
Starlark. Use repositories you intend to load with Bazel.

## Refresh and truth labels

`useBuildGraph` observes once when enabled for the opened project. Its optional
`changeToken` is the existing working-source revision: changes debounce for two
seconds. Hidden or blurred documents stop scheduling, and returning to the app
revalidates after two seconds. A settled observation has no polling timer. While
an input sample or query is running, one request chain checks its result every
500 ms, for at most 40 seconds per input-check cycle (a 125-second observation
window when a query loads dependencies, including cleanup margin). The core samples inputs at most
once per 1.5 seconds and coalesces requests. Queries occur only on first demand,
explicit **Refresh dependencies**, or changed build inputs—not every source edit.

The cockpit App owner mounts this shared hook with live-core readiness independent
of pane visibility, and passes `snapshot.revisions.working.fingerprint` as `changeToken`.
The hook alone does not change the App's selected-pane policy. The fixed example
service-artifact build is a separate explicit operation; this automatic path
never compiles binaries or advances the built/deployed revision.

The fingerprint covers tracked plus nonignored filename membership, physical
presence/kind, symlink targets, and bytes of BUILD, BUILD.bazel, WORKSPACE variants,
MODULE.bazel and its lock, `.bazelignore`, and `.bzl` files. Source-text-only edits
do not trigger a query. New/deleted filenames can affect globs and do trigger one.
Ignored files, external repositories, environment-dependent definitions and other
unobserved inputs need explicit Refresh. This is conservative local observation,
not omniscient change detection or a snapshot filesystem.

- **Current** means the returned query matched the exact repository/world and
  sampled input fingerprint before and after execution.
- **Refreshing**, **stale** and **error** retain the last consistent graph with its
  original timestamp/fingerprint; they never relabel it as fresh evidence.
- **Partial** means targets, edges or referenced dependencies were omitted or
  unresolved. Complete means complete returned local query, not global closure.
- **Unavailable** means no supported local Bazel provider/root. It is not an empty
  complete graph. Failed unchanged inputs wait for explicit retry or a new digest.

## Bounds and ownership

Each provider reuses one private temporary output/dependency cache with an owned
PID-namespace process tree, not a shared Bazel server. Opening a trusted project,
changing its build inputs or selecting a worktree automatically permits declared
dependency loading, with visible progress and **Cancel refresh**. The same immutable
worktree provider/cache is reused on return. Failed unchanged inputs wait for
**Refresh dependencies**; status ticks and source-only edits do not restart queries.
No compilation occurs. The cache is
removed after confirmed provider shutdown. It runs batch mode with three loading/JVM
workers, a 512 MiB Java heap and a 120-second dependency-query deadline (30 seconds
for the explicit low-level offline mode). The old 4 MiB raw query-output cutoff is
removed at the user's request. Output progress reports MiB received; diagnostics
retain only a 4 KiB tail. The current collector still buffers raw stdout, so very
large query representations can use substantial core memory. Revisit streaming
or an output cap if actual resource measurements warrant it; source repository
size is not a reliable proxy for query-output size. The compact graph still has
its independent 4 MiB wire bound. A bounded readable stderr tail
survives failure instead of hiding dependency setup errors. The
projection permits 2,000 targets and 8,000 edges. Input sampling permits 20,000
paths and 8 MiB of definition bytes. Ordinary filesystem metadata calls retain
the existing OS-stall limitation; these are finite byte/count bounds, not a claim
that arbitrary kernel I/O can be forcibly cancelled in-process.

Exit initiates owner closure, late stdout is drained, and publication waits for
confirmed cleanup. Unconfirmed cleanup retains scratch evidence, blocks subsequent
queries and refuses successful shutdown attestation. No unowned Bazel server is
killed. Graph refresh does not grant agent/model/provider authority.

If a temporary input-read failure or missing workspace marker is repaired and
the inputs match the retained graph, that graph becomes current without another
query. A failed query of those same inputs remains an error until explicit retry
or an input change. This distinction keeps recovery useful without hiding a
failed refresh.

## Reproducible acceptance

The dedicated `//tools/build-graph:packaged-build-graph-test` creates two independent
real Git/Bazel repositories, each with two packages and a dependency. The ordinary
packaged main/preload/core/UI observes actual edge removal/addition and preserves
source bytes/cursor, unsent draft, graph instances and cameras across refresh,
hide/reactivation and explicit retry. It asserts no renderer exceptions or model
turns. These small repositories are authored test inputs to real Bazel, not captured
or injected provider observations. Controlled unit tests separately cover malformed
output, overflow, timeout, cancellation, moved inputs and unavailable providers.

`//tools/build-graph:checks` runs focused automatic hook, provider, process-owner
and legacy explicit service-startup checks plus both TypeScript boundaries.
Run all builds/tests through Nix and Bazel with `--jobs=3`. Desktop acceptance must
own a virtual X11 desktop and an available configured port; never automate the
physical preview. B1 evidence and precise test attribution are recorded
in `.planning/dynamic-build-graph.md` and its linked step directory.

`//tools/build-graph:compat-checks` additionally checks automatic declared setup,
large raw records, retained failures and cancellation. `//tools/build-graph:compat-probe`
takes an actual repository path, starts with passive `observe(false)`, reports
raw bytes/record counts and coverage, proves one-query cache reuse, checks unchanged
Git status, and confirms cleanup. `//tools/build-graph:startup-smoke` observes the
real packaged bridge passively and proves the graph is ready before opening its
lens, without a refresh click or target compilation.
