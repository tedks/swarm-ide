# swarm-ide

`swarm-ide` is a Linux-first development cockpit for understanding a monorepo
and steering applications of agent intelligence across it. The prototype keeps
repo and service graphs distinct, coordinates them through a shared focus, and
shows working, built, and deployed state beside the work changing them.

The project is private while prototyping and licensed under GNU AGPLv3.

## Prerequisites

- Nix with flakes enabled
- An X11 desktop for the current computer-use smoke loop

## Get started

```bash
nix develop --command bazel build //...
nix develop --command bazel test //...
nix develop --command bazel run //:dev
```

The development target starts one long-running Electron/Vite session. Renderer
changes use Vite HMR and do not restart Bazel.

Run the real-window verification loop with:

```bash
nix develop --command bazel run //tools:desktop-smoke
```

## Structure

- `app/` — Electron shell and React workbench
- `core/` — privileged local process and mock providers
- `protocol/` — runtime-validated shared contracts
- `fixtures/` — deterministic world states
- `tests/` — contract and interaction tests
- `tools/` — development and desktop automation
- `docs/` — product and architecture decisions

See [AGENTS.md](AGENTS.md) for contributor and agent instructions.
A local-first graph-centric IDE for steering agent swarms across the software lifecycle
