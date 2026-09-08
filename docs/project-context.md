# Automatic project context

Open a project and the Context pane discovers local Node.js, Python and Hugo servers,
Docker Compose containers, and components declared in source manifests. There is no per-repository setup,
personal-project list or project script execution. The panel refreshes every ten
seconds while visible and connected; a temporary failure retains its last timestamp.
Changing the opened repository or core generation discards previous ownership.
Empty instruments disappear, including the enclosing panel if nothing was found.
Previously observed values remain visible with their original time during temporary
discovery failures; missing tooling does not create a wall of empty cards.

## Local servers

Linux process executable, start time, working directory, socket descriptors and
listening TCP tables identify known Node.js, Python and Hugo executables. A process under this canonical
worktree qualifies. A Bazel runfiles process can also qualify through the exact
`bazel-bin` or `bazel-out` symlink plus a source-package backlink to this checkout.
Names and port conventions alone do not establish ownership.

Nested Bazel roots are found through a bounded directory walk. Generated/dependency
directories, symlinks and separate nested Git checkouts are skipped. Open a submodule
as its own project to discover its work. The exact nested build-root backlink must
agree with the process before it receives ownership.

An Electron package's private Node/Vite server is excluded from browser suggestions:
it is the transport for a desktop application, not a usable web version. Detection
uses the nearest package's Electron dependency plus desktop entry/configuration;
an independent nested web package does not inherit its parent's exclusion.

The provider probes only a matched local socket with a bounded HTTP HEAD request.
An HTTP response enables a browser link; a non-HTTP or unavailable probe leaves
the address and port as text. Wildcard listeners use the machine hostname in
links, while loopback listeners remain local. This is a listening observation,
not a production-health or deployment claim. No process environment, command
arguments, response body, redirects or credentials are collected.

## Containers

The installed Docker CLI reads a local Unix-socket daemon with fixed, formatted
commands. Only container identity, name, image, state, health, published ports,
Compose working-directory/service labels and one-shot CPU/memory are read.
Canonical Compose working-directory labels must lie within the opened worktree.
Sibling worktrees, old nonexistent paths, unlabelled containers and remote Docker
contexts are not assigned to this project. Generic container ports remain TCP/UDP
addresses, not guessed web links. Containers are never started, stopped or changed.

## Components, connections and sites

`core/project-context/catalog.ts` reads a bounded set of ordinary source manifests.
Node packages, Python manifests, Hugo sites, Move packages, OCaml projects and Bazel
markers supply component names and tooling. Package script names provide workflow
categories; their commands are never executed or presented as passing tests.
Local manifest dependencies connect discovered components; unresolved dependencies
do not become fabricated services. Hugo base URLs produce explicitly configured
site links, not health or deployed-version badges.

The catalog is independent of runtime discovery: a library can appear as a component
without being a server. Conversely, an observed Python server remains useful even
when its project has no supported manifest. Source configuration is read afresh on
the existing refresh cycle, not promoted to deployment state. Metadata failures keep
the prior catalog with its own original observation time.

The six-project scan motivating this increment is captured in
[the continuation plan](../.planning/project-context-catalog.md). Personal project
names and paths are not detector rules. In particular, nested build roots and
multiple publication outputs are common patterns, not special cases for slowed
or the user's website.

## Limits and next integrations

Each observation is bounded to 32 servers and 32 containers, 16 endpoints each.
Proc scanning and fixed Docker commands expire; requests coalesce in local core
and briefly reuse the same observation. Disposal cancels owned pending reads.
Missing tooling or access does not create numeric zeros or empty UI sections.
Partial scans retain a compact coverage notice beside returned entries.

Firebase Hosting/Cloud Run deployment observations, Sui chain/package checks,
Walrus storage expiry, Discord gateway/session counters and media-render job queues
remain future live adapters. Existing source conventions establish useful components,
not those measurements. In particular, tracked hosts or image tags do not establish
the currently deployed commit. A safe aggregate status interface is preferable to
collecting customer data or arbitrary application logs.

## Code and direct checks

`protocol/project-context.ts` is the validated observation contract.
`core/project-context/` implements independent runtime, Docker and manifest detectors and a
coalescing provider; `core/worker-runtime.ts` accepts only the opened repository
and world. `app/renderer/project-context/ProjectContextPanel.tsx` renders it without
changing source, graph or task attention. These files enter `//:quality_sources`
and therefore `//:desktop-bundle`.

Run `nix develop --command bazel test --jobs=3 //tools/project-context:checks` for
focused contracts, ownership, cancellation, race and mounted panel tests.
`//tools/project-context:packaged-test` exercises an actual local Node listener in
a disposable Git project, configured Hugo destination and local Move dependency through packaged core/preload/renderer on owned virtual
X11. `nix develop --command bazel run --jobs=3 //tools/project-context:probe -- /absolute/project`
prints a current read-only diagnostic for an explicitly selected local project.
