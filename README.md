# Swarm IDE

A Linux-first development cockpit: navigate a repository, inspect the context
around a file or service, and prepare and steer a focused agent conversation.
Source, design, tasks, and instructions stay with the repository; separate views
help you move between them without losing your place.

This is a working prototype, not a general-purpose replacement for your editor.
Repository browsing, source editing, Ditz tasks and dependency graphs, authored
plan hierarchies, per-repository Bazel queries, and disk-context preparation are
real. The separate **Codex · trusted local** profile supports explicit launch
using your installed Codex's normal account, configuration, tools and approvals;
the isolated read-only profile remains unavailable. Explicitly registered external
sessions can be observed without controlling them; an explicit **Send message**
can steer a checked live target. Queue acceptance is not delivery or completion,
and the IDE does not own those external processes. Activity log contains supervised-generated,
recorded summaries, not live in-app summarization. Mocks and deterministic
rehearsals are not live execution. Start with [installation and troubleshooting](docs/evaluator-install.md),
then the [connected walkthrough](docs/demo.md).

## Current controls

- Click a task to open its central document and Context metadata, recorded update
  log and blocking relationships. See [task workspace](docs/task-workspace.md).
- From a source-file draft, optionally attach a task, then **Prepare trusted-local
  context**, review the exact prompt and confirm **Launch trusted-local Codex**.
  No account is copied or extra autonomy granted. Use **New conversation** and
  the run list to manage up to eight live conversations with independent message
  composers. Up to twenty records retain bounded history, including admitted
  task links; restart archives history without automatically resuming or replaying
  conversations. See [execution and limits](docs/trusted-local-execution.md).
- Optionally [register a known external worker](docs/session-registration.md)
  to inspect its ancestry, activity and checked steering controls. Registration
  neither launches an agent nor scans for unregistered sessions.
- **Recent Activity → Activity log → Pull requests → Refresh PRs** reads the
  opened repository's GitHub PRs using normal `gh` authentication. See
  [Activity and PRs](docs/logical-changelog.md#github-pull-requests).
- File Context shows observed direct/indirect build targets and separately labelled
  **Illustrative** latency. **Builds & resources → Example profile** shows authored
  CPU/memory distributions, not measured telemetry. Missing services/targets stay
  compact and scoped; [Context details](docs/context-metrics-demo.md) explain the limits.

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
git fetch origin refs/heads/ditz-metadata:refs/heads/ditz-metadata
nix develop --command pnpm install --frozen-lockfile
nix develop --command bazel build --jobs=3 //:desktop-bundle
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
evidence is not replaced by demo data. Use trusted local repositories: explicit
Build can execute their build rules and Bazel wrapper. Opening **Build graph**
or enabling **Build links**, including file Context's build-target observation,
also loads repository-controlled Bazel definitions for a query; that is not a
security sandbox. Simply opening an external target
does not automatically start its topology build.

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

The quick-start sequence above already does this fetch. Choose **Refresh tasks**
in the IDE. For another repository, run the fetch
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

To exercise the installation path itself after fetching the local Ditz branch:

```bash
SWARM_VIRTUAL_DISPLAY=:134 SWARM_VIRTUAL_DESKTOP_PORT=55214 \
  nix develop --command bazel run --jobs=3 //tools/demo-install:smoke
```

This creates a fresh local Git clone, materializes its dependencies, and opens
real files in that checkout and two disposable target repositories on owned
virtual X11. It checks startup rejection and explicit-build authority, records
screenshots under `artifacts/demo-install/`, and retains its temporary checkouts
for inspection. Shared Nix/package download caches are allowed; this is not a
cold-download benchmark. Choose a free display/port pair; the harness refuses
occupied endpoints and never takes another application's window. This target
runs its own cases sequentially; independent checkouts can use separate pairs.

Automated GUI checks create and clean up their own Xvfb/Openbox desktop; they
never drive your existing application window. See
[development and visual verification](docs/development-loop.md) for additional
scenarios, evidence locations, and reload behavior.

`bazel build //:desktop-bundle` produces `bazel-bin/swarm-ide-foundation.tar.gz`: compiled
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
