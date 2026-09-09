# Swarm IDE

A Linux-first cockpit for understanding a codebase and steering the agents working
on it. Design, source, tasks and instructions stay in the repository. Coordinated
graphs, conversations and contextual tools let you move between them without
losing your place.

Swarm edits real repositories, reads Ditz tasks, displays authored designs and
queries Bazel dependencies. It can follow existing Codex sessions in tmux or run
conversations through your installed Codex. The Work Log summarizes what agents
accomplished; Activity shows their individual operations.

## Linux quick start

Use Linux x86_64, Git, Nix with `nix-command` and `flakes` enabled, and a working
X11 desktop. Clone the public repository:

```bash
git clone https://github.com/tedks/swarm-ide.git
cd swarm-ide
nix run . -- --workspace "$PWD"
```

This builds and opens the installed application, **not a development server**.
The first build downloads pinned dependencies; later launches reuse the build.
No model account is needed to browse. To keep a command on your PATH:

```bash
nix profile install .#swarm-ide
swarm --workspace /absolute/path/to/your/project
```

Choose a Git **working-tree root with a committed HEAD**—for a bare-repo layout,
use `~/Projects/project/master`, not its parent. An ordinary standalone clone or
a linked worktree on the Linux host is suitable.

### Try another project and its agents

Give each project its own window/history profile when opening several at once:

```bash
swarm --workspace "$HOME/Projects/puresky/master" \
  --user-data-dir "$HOME/.config/swarm-ide-puresky"
```

To include already-running Codex sessions, add the exact tmux association:

```bash
swarm --workspace "$HOME/Projects/puresky/master" \
  --user-data-dir "$HOME/.config/swarm-ide-puresky" \
  --tmux-server personal --tmux-session puresky
```

Use your own existing project/session names. This scans that session once; it
does not start, clone or resume agents. Closing Swarm leaves these terminal
agents running. Discovery currently recognizes Codex, not every harness or pane.
To reuse a maintained registry instead, pass
`--agent-registry /absolute/private/agents.json` without the tmux flags.

Or click **New agent** beside the conversation tabs, enter a task, and press
**Enter**. This starts Codex in the workspace shown above the composer using your
normal Codex installation and account. No existing tmux session is required.

Start with the [five-minute tour](docs/demo.md).
[Linux installation](docs/linux-install.md) covers all flags and fleet
installation; the [evaluator guide](docs/evaluator-install.md) covers setup and
troubleshooting.

### Make repository tasks available

Swarm reads the selected repo's local `ditz-metadata` branch. For a fresh Swarm
clone, fetch it without switching the source checkout:

```bash
git fetch origin refs/heads/ditz-metadata:refs/heads/ditz-metadata
```

Tasks update when that local ref changes. Swarm does not fetch the remote for you.
In another project, do this only if it uses Ditz. Do not force-fetch over an
existing divergent branch; use the [Ditz workflow](AGENTS.md#issue-tracking-ditz).
Missing plans/tasks do not prevent file browsing.

## Mac or browser evaluation

The [Docker/noVNC demo](docs/container-demo.md) opens a small included project
in the real Linux app through your browser:

```bash
docker compose up --build
```

Open [the local desktop](http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale)
and use the password printed in the terminal. This is a **design/source browsing
demo**, not the full agent/build workflow: the current container cannot run
owned agent or Bazel-query subprocesses or observe your Mac's agents.

Linux/amd64 Docker was tested; Mac, Apple Silicon and Safari were not. There is
no native Mac package or published image yet, and the first local image build
downloads several gigabytes. Use native Linux to evaluate live swarm operation.

## What to explore

- **Workspace:** component designs, task dependencies, files and build/service
  views. Open a document and the graphs remain beside it. Supported Bazel
  declarations load automatically; **Build selected target** compiles deliberately.
  Repositories without a plan offer **Generate component plan**, a configurable
  Codex action that writes the design into the repo.
- **Source and Context:** edit real files; inspect direct/indirect Bazel target
  membership and available project instruments. Example latency/resource profiles
  are marked illustrative, not production telemetry.
- **Agents:** start Codex or follow a registered conversation. Its worktree icon
  switches the main workspace to that checked worktree; the terminal icon copies
  the existing session's attach command. Enter sends; Shift-Enter adds a line.
  Submitted messages remain copyable while queued.
- **Activity and Work Log:** timestamped operations beside human-readable outcomes.
  Work Log **Start** invokes its configured summarizer; merely reading does not.
  Saved summaries and GitHub PRs are separate views in the Activity document.

Agent harnesses, accounts and optional `gh`/Docker tools remain your normal host
setup. Trusted-local agent runs use those permissions. Bazel observation loads
repository-controlled definitions and may download declared dependencies, so open
projects whose tooling you trust. A query is not a binary build.
See [current workflow limits](docs/demo.md#current-limits).

## Develop Swarm itself

The installed path above is for using Swarm. For source development:

```bash
nix develop --command pnpm install --frozen-lockfile
SWARM_DEV_PORT=55173 nix develop --command bazel run --jobs=3 //:dev
```

Choose a free development port; the installed app needs no Vite port. See
[development and visual verification](docs/development-loop.md) for hot reload,
builds and owned virtual-X11 checks. Save before closing.

`nix develop --command bazel build --jobs=3 //:desktop-bundle` produces
`bazel-bin/swarm-ide-foundation.tar.gz`. That tarball contains compiled app code,
not a standalone installer; the Nix package supplies the runtime.

## Project map

- `app/`: Electron shell and sandboxed React workbench
- `core/`: privileged local providers
- `protocol/`: runtime-validated contracts
- `fixtures/` and `tests/`: synthetic worlds and verification
- `tools/`: launch and desktop-verification tools
- `docs/design/`: living system design and component responsibilities

Licensed under [GNU AGPLv3](LICENSE) (`AGPL-3.0-only`).
See [AGENTS.md](AGENTS.md) for contributor instructions.
