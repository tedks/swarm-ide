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
nix develop --command pnpm install --frozen-lockfile
nix develop --command bazel build //...
nix develop --command bazel test //...
nix develop --command bazel run //:dev
```

The development target starts one long-running Electron/Vite session. Renderer
changes use Vite HMR and do not restart Bazel.

If the default loopback port `5173` is occupied, select one explicit port for
the development process and its verification commands:

```bash
SWARM_DEV_PORT=55173 nix develop --command bazel run //:dev
SWARM_DEV_PORT=55173 nix develop --command bazel run //tools:desktop-smoke
SWARM_DEV_PORT=55173 nix develop --command bazel run //tools:measure-hmr
```

`SWARM_DEV_PORT` must be a decimal integer from `1` through `65535`. When it is
unset, the default remains `5173`; an invalid or unavailable requested port
fails rather than selecting another port.

Run the real-window verification loop with:

```bash
nix develop --command bazel run //tools:desktop-smoke
nix develop --command bazel run //tools:measure-hmr
```

The normal cockpit opens the real working tree and leaves service topology
unobserved until the user runs its fixed Bazel topology build. The checked-in
demo grounds `FraudCheck.Assess` and its `Payments.Authorize` dependency in
public Protocol Buffers/gRPC-style service contracts, while Bazel declares the
owned implementation inputs and produces the deterministic semantic artifact.
Fixtures remain test-only. See [the product foundation](docs/product-foundation.md),
[architecture](docs/architecture.md), and
[development loop](docs/development-loop.md) for the precise boundary.

## Structure

- `app/` — Electron shell and React workbench
- `core/` — privileged local process and typed providers
- `protocol/` — runtime-validated shared contracts
- `fixtures/` — deterministic world states
- `tests/` — contract and interaction tests
- `tools/` — development and desktop automation
- `docs/` — product and architecture decisions

See [AGENTS.md](AGENTS.md) for contributor and agent instructions.
