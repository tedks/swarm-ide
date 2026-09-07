# Swarm IDE

A Linux-first development cockpit: navigate a repository, inspect the context
around a file or service, and prepare a precisely scoped task for an agent.
Source, design, tasks, and instructions stay with the repository; separate views
help you move between them without losing your place.

This is a working prototype, not a general-purpose replacement for your editor.
Repository browsing, source editing, Ditz task inspection, and disk-context
preparation are real. Managed agent launch is currently unavailable; labelled
mock conversations and deterministic rehearsals are not live agent execution.
Start with the [five-minute walkthrough](docs/demo.md).

## Linux quick start

You need Git, Nix with `nix-command` and `flakes` enabled, and a working X11
desktop connection (`DISPLAY` and, where needed, `XAUTHORITY`). Run as your normal
user, not root. The Electron sandbox must be supported by your host; do not
disable it to make the demo start. Linux x86_64 is the tested platform. The flake
also declares aarch64-linux, but that architecture has not been verified.

Clone using an account that has access to the repository:

```bash
git clone git@github.com:tedks/swarm-ide.git
cd swarm-ide
nix develop --command pnpm install --frozen-lockfile
nix develop --command bazel build --jobs=3 //...
SWARM_DEV_PORT=55173 nix develop --command bazel run --jobs=3 //:dev
```

The pinned flake supplies Electron, Node, pnpm, Bazel, and the desktop tools. The
first run needs network access to materialize Nix and package dependencies and
can take longer than subsequent launches. It does not install an agent account
or ask for model-service credentials.

The command opens Swarm's own checkout by default. To browse a different local
repository, keep running the command **from the Swarm IDE checkout** and select
the target explicitly:

```bash
SWARM_DEV_PORT=55173 nix develop --command bazel run --jobs=3 //:dev -- --workspace /path/to/your/repository
```

The target must be an existing Git working-tree root with a committed `HEAD`.
Relative paths are resolved from the directory where you invoke the command.
The IDE's dependencies and development output stay in the IDE checkout, not the
target. A non-Bazel repository can still be browsed; unavailable build or service
evidence is not replaced by demo data. Use trusted local repositories: building
a repository can execute its build rules.

Leave the terminal running. Renderer changes use hot reload; most local-core
changes recover without replacing the native window. Main-process changes need
a deliberate restart. Stop with Ctrl-C and rerun the same command. Save work
before stopping; reload guards are not crash-proof backups.

### Make repository tasks available

Tasks are read locally from `refs/heads/ditz-metadata`, not from an online issue
tracker or an automatically fetched remote. An ordinary clone usually has only
the remote-tracking branch. For a **fresh Swarm clone**, create the local
metadata branch without switching your source checkout:

```bash
git fetch origin refs/heads/ditz-metadata:refs/heads/ditz-metadata
git show-ref --verify refs/heads/ditz-metadata
```

Then choose **Refresh tasks** in the IDE. For another repository, run the fetch
there only if it actually uses this Ditz metadata format. A missing branch means
task information is unavailable, not that the project has no work. Do not force
an existing divergent metadata branch over local changes; contributors use the
[Ditz workflow](AGENTS.md#issue-tracking-ditz). The Ditz CLI is not required just
to read existing tasks in the IDE.

### If startup fails

- Port occupied: choose another `SWARM_DEV_PORT`. The default is `5173`; explicit
  values must be decimal integers in `1..65535`. The launcher fails rather than
  silently choosing a different port. Leave unrelated services alone.
- Workspace rejected: pass the working-tree root, not a subdirectory, a bare
  repository, or an empty Git repository with no commit.
- Missing dependencies or Electron version mismatch: use the pinned Nix shell
  and rerun the frozen install; do not substitute a global Electron or update
  package versions independently.
- No display or sandbox support: use a supported logged-in Linux/X11 session.
  Automated verification below owns a virtual desktop and needs no logged-in
  display. It is not an invitation to bypass the sandbox.
- Build/service information unavailable: inspect the reported evidence scope.
  The current service extractor supports Swarm's checked-in example, not every
  arbitrary repository.

## Verification and packaging

```bash
nix develop --command bazel test --jobs=3 //...
SWARM_VIRTUAL_DESKTOP_PORT=55174 nix develop --command bazel run --jobs=3 //tools:desktop-smoke
```

Automated GUI checks create and clean up their own Xvfb/Openbox desktop; they
never drive your existing application window. See
[development and visual verification](docs/development-loop.md) for additional
scenarios, evidence locations, and reload behavior.

`bazel build //...` produces `bazel-bin/swarm-ide-foundation.tar.gz`: compiled
Electron main/preload code, local core (including its YAML dependency), and
renderer assets. **It is not a standalone installer.** It does not include the
Electron executable, Nix/system runtime, or your repository. The supported
interactive entry for this prototype is the Nix/Bazel command above.

## Project map

- `app/`: Electron shell and sandboxed React workbench
- `core/`: privileged local providers
- `protocol/`: runtime-validated contracts
- `fixtures/` and `tests/`: explicitly synthetic worlds and verification
- `tools/`: supported launch and desktop-verification entry points
- `docs/`: [product foundation](docs/product-foundation.md),
  [architecture](docs/architecture.md), and implementation decisions

Licensed under [GNU AGPLv3](LICENSE) (`AGPL-3.0-only`). See
[AGENTS.md](AGENTS.md) for contributor instructions.
