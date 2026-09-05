# swarm-ide

`swarm-ide` is a Linux-first development cockpit for understanding a monorepo
and steering applications of agent intelligence across it. The prototype keeps
repo and service graphs distinct, coordinates them through a shared focus, and
shows working, built, and deployed state beside the work changing them.

The project is private while prototyping and licensed under GNU AGPLv3.

## Prerequisites

- Nix with flakes enabled
- A Linux host; visual verification creates its own virtual X11 desktop

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
the long-running development process and HMR work you perform manually:

```bash
SWARM_DEV_PORT=55173 nix develop --command bazel run //:dev
```

`SWARM_DEV_PORT` must be a decimal integer from `1` through `65535`. When it is
unset, the default remains `5173`; an invalid or unavailable requested port
fails rather than selecting another port.

Run self-contained visual verification with:

```bash
SWARM_VIRTUAL_DESKTOP_PORT=55174 nix develop --command bazel run //tools:desktop-smoke
SWARM_VIRTUAL_DESKTOP_PORT=55174 nix develop --command bazel run //tools:desktop-zoom-smoke
SWARM_VIRTUAL_DESKTOP_PORT=55174 nix develop --command bazel run //tools:measure-hmr
```

Each command creates a private Xauthority file, starts its own Xvfb server and
Openbox window manager, launches the exact development app inside them, and
tears down only its recorded process sessions. Inherited `DISPLAY` and
`XAUTHORITY` values are replaced. Screenshots, logs, timings, ownership records,
and resource samples are reported under `artifacts/<scenario>/<run>/`; the
representative Bazel test uses `TEST_UNDECLARED_OUTPUTS_DIR` for CI retention.

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
