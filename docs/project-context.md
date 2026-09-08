# Automatic project runtime context

Open a project and the Context pane discovers local Node.js servers and Docker
Compose containers for that exact worktree. There is no per-repository setup,
personal-project list or project script execution. The panel refreshes every ten
seconds while visible and connected; a temporary failure retains its last timestamp.
Changing the opened repository or core generation discards previous ownership.

## Local servers

Linux process executable, start time, working directory, socket descriptors and
listening TCP tables identify Node.js processes. A process under this canonical
worktree qualifies. A Bazel runfiles process can also qualify through the exact
`bazel-bin` or `bazel-out` symlink plus a source-package backlink to this checkout.
Names and port conventions alone do not establish ownership.

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

## Limits and next integrations

Each observation is bounded to 32 servers and 32 containers, 16 endpoints each.
Proc scanning and fixed Docker commands expire; requests coalesce in local core
and briefly reuse the same observation. Disposal cancels owned pending reads.
Missing tooling or access leaves a compact unavailable state, not numeric zeros.
Partial scans say so; absence is scoped to the observed worktree.

The initial project scan also identified Python/FastAPI, Expo, Firebase Hosting,
Cloud Run, Sui devstacks and OCaml service workflows. Those are future adapters,
not live metrics in this increment. In particular, tracked deployment hosts or
image tag conventions do not establish the currently deployed commit.

## Code and direct checks

`protocol/project-context.ts` is the validated observation contract.
`core/project-context/` implements independent Node/Docker detectors and a
coalescing provider; `core/worker-runtime.ts` accepts only the opened repository
and world. `app/renderer/project-context/ProjectContextPanel.tsx` renders it without
changing source, graph or task attention. These files enter `//:quality_sources`
and therefore `//:desktop-bundle`.

Run `nix develop --command bazel test --jobs=3 //tools/project-context:checks` for
focused contracts, ownership, cancellation, race and mounted panel tests.
`//tools/project-context:packaged-test` exercises an actual local Node listener in
a disposable Git project through packaged core/preload/renderer on owned virtual
X11. `nix develop --command bazel run --jobs=3 //tools/project-context:probe -- /absolute/project`
prints a current read-only diagnostic for an explicitly selected local project.
