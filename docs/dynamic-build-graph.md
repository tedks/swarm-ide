# Build graph: current repository declarations

Open **Build graph**, or enable directory **Build links**, to request a real
Bazel observation for the registered repository. There is no production fallback
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
loading still evaluates repository-controlled definitions. Downloads are disabled;
this is not a newly established network/filesystem sandbox for arbitrary untrusted
Starlark. Use repositories you intend to load with Bazel.

## Refresh and truth labels

While a graph/link consumer is visible, one renderer request chain samples status
at 500 ms; the core coalesces work and samples inputs at most once per 1.5 seconds.
Queries occur on first demand, explicit **Refresh build graph**, or changed input
fingerprints—not on every request, camera movement, React render or source edit.
Hidden consumers stop the chain. Reopening them revalidates retained data.

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

Each query uses a private temporary output root and an owned PID-namespace process
tree, not a shared Bazel server. It runs batch mode with three loading/JVM workers,
a 512 MiB Java heap, a 30-second query deadline, and 4 MiB combined output. The
projection permits 2,000 targets and 8,000 edges. Input sampling permits 20,000
paths and 8 MiB of definition bytes. Ordinary filesystem metadata calls retain
the existing OS-stall limitation; these are finite byte/count bounds, not a claim
that arbitrary kernel I/O can be forcibly cancelled in-process.

Exit initiates owner closure, late stdout is drained, and publication waits for
confirmed cleanup. Unconfirmed cleanup retains scratch evidence, blocks subsequent
queries and refuses successful shutdown attestation. No unowned Bazel server is
killed. Graph refresh does not grant agent/model/provider authority.

## Reproducible acceptance

The dedicated `//tools/build-graph:packaged-build-graph-test` creates two independent
real Git/Bazel repositories, each with two packages and a dependency. The ordinary
packaged main/preload/core/UI observes actual edge removal/addition and preserves
source bytes/cursor, unsent draft, graph instances and cameras across refresh,
hide/reactivation and explicit retry. It asserts no renderer exceptions or model
turns. These small repositories are authored test inputs to real Bazel, not captured
or injected provider observations. Controlled unit tests separately cover malformed
output, overflow, timeout, cancellation, moved inputs and unavailable providers.

Run all builds/tests through Nix and Bazel with `--jobs=3`. Desktop acceptance must
own a virtual X11 desktop and port55174 under the shared virtual-test lock; never
automate the physical preview. B1 evidence and precise test attribution are recorded
in `.planning/dynamic-build-graph.md` and its linked step directory.
