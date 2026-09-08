# Install and run the Swarm IDE demo

This is the supported **Linux/Nix source-checkout path**, not a standalone
downloadable application. Start with Swarm's own repository to see its checked-in
plans, tasks, service example and recorded logical-change story. Then follow the
[connected walkthrough](demo.md). No model account is needed for its browsing,
preparation and recorded-Activity path. Optional **Codex · trusted local** launch
uses an existing installed account; the isolated read-only profile remains
unavailable.

## Before you start

Use a normal, non-root user on Linux x86_64 with Git and
[Nix installed](https://nixos.org/download/). Nix must have `nix-command` and
`flakes` enabled. If needed, add `extra-experimental-features = nix-command flakes`
to your existing user `nix/nix.conf` under your configuration directory, normally
`~/.config/nix/nix.conf`; preserve other settings. See the
[Nix configuration reference](https://nix.dev/manual/nix/stable/command-ref/conf-file.html).
Installing Nix itself is a prerequisite, not something this demo test installs.

For an interactive window, use a logged-in X11 desktop terminal with a valid
`DISPLAY` and any required `XAUTHORITY`. XWayland may provide an X11 connection,
but the verified environment is Xorg; native Wayland, macOS, Windows/WSL and ARM
have not been verified. The flake declares `aarch64-linux` without claiming a
tested demo there. Your host must support Electron's sandbox and the Linux
namespace facilities used by owned subprocesses. Do not use `sudo`,
`--no-sandbox`, or disable host security controls to work around a startup error.

The repository is private during prototyping: your GitHub account needs an
explicit grant of access and working Git authentication. The commands below use
SSH; an already-authenticated HTTPS clone is also suitable. A repository-not-found
or permission error is an access problem, not an instruction to make it public.
Initial Nix and pnpm dependency downloads require network access, disk space and
time. This rehearsal reused download caches; no cold-install duration is promised.

## Fresh checkout to first window

Run these in a terminal, choosing an unused destination for the clone:

```bash
git clone git@github.com:tedks/swarm-ide.git
cd swarm-ide
git fetch origin refs/heads/ditz-metadata:refs/heads/ditz-metadata
git show-ref --verify refs/heads/ditz-metadata
nix develop --command pnpm install --frozen-lockfile
nix develop --command bazel build --jobs=3 //:desktop-bundle
SWARM_DEV_PORT=55173 nix develop --command bazel run --jobs=3 //:dev
```

The pinned Nix environment supplies Node, pnpm, Bazel, Java, Electron and desktop
tools. The frozen install materializes `node_modules` without selecting new
dependency versions. The targeted build creates the desktop bundle; running
every test or building every proof is **not required to open the demo**.

Leave that terminal running. You should get a native Swarm IDE window with
**Directory**, graph tabs and a source area. Open **Ctrl-K → Open repository
path**, enter `README.md`, and press Enter to open actual checkout bytes.
Expand **Tasks** and choose **Refresh tasks** to read the local metadata branch.
Follow the [tour](demo.md) for plans, graph relationships, task context and
Activity. External agent observations are optional and require deliberate private
registration; an empty observer is not a broken installation.

### Optional accounts: execution and GitHub PRs

Neither account is installed by the quick start. To run an agent, make your
normally configured/authenticated Codex available in the IDE launch PATH (or set
the documented `SWARM_CODEX_BIN` executable path). Open a source-file agent draft,
optionally attach a task, and use **Prepare trusted-local context → review exact
prompt → permission confirmation → Launch trusted-local Codex**. It inherits
normal configuration, tools and approvals; no account is copied or additional
autonomy enabled. One conversation per core, without IDE restoration across core
restart. See [execution and limitations](trusted-local-execution.md).

To inspect PRs, make ordinary `gh` available in the same launch environment and
authenticate normally with `gh auth login`. In **Recent Activity → Activity log →
Pull requests**, choose **Refresh PRs**. The opened checkout needs a supported
github.com origin; this is a bounded explicit read, not a background GitHub or CI
sync. See [PR scope and custom-XDG configuration](logical-changelog.md#github-pull-requests).
Do not paste account files or tokens into the IDE. Recorded summaries do not
require GitHub authentication and are not generated live when you open them.

`55173` is an example free loopback port, not a reserved service. Set another
unused decimal integer in `1..65535` if necessary. The default when omitted is
`5173`. Swarm fails on an occupied port instead of killing its owner or quietly
switching ports. Opening the HTTP address alone is not the supported demo: the
desktop window supplies the privileged local-core bridge.

## Open another repository

Stop the current launch with Ctrl-C, then run **from the Swarm IDE checkout**:

```bash
SWARM_DEV_PORT=55173 nix develop --command bazel run --jobs=3 //:dev -- --workspace "/absolute/path/to/your/repository"
```

Pass an existing Git **working-tree root with a committed HEAD**, not an inner
directory, bare repository or newly initialized repository with no commit.
Relative paths resolve from the directory where the command was invoked. Quote
paths containing spaces. The IDE's dependency and development outputs remain in
the IDE checkout; selecting a target does not install packages into that target.
Editing and explicitly saving a source does, of course, change the selected repo.

A non-Bazel repository still supports real directory/file browsing. Missing
service, task, plan or deployment data is shown as unavailable, not filled with
Swarm's example data. The service extractor is currently specific to Swarm's
checked-in example. [Build graph](dynamic-build-graph.md) is a separate real
Bazel declaration query with its own supported-root and runtime limits.

Use repositories whose tooling you trust. Opening an external target does not
automatically run its topology build. **Build** explicitly executes build tooling;
opening **Build graph**, enabling **Build links**, or inspecting a file's Context
build targets requests an observation that can query repository-controlled Bazel
definitions. Those operations are not an untrusted
code sandbox. A successful query is not evidence of successful compilation.

## Tasks and metadata

The IDE reads `refs/heads/ditz-metadata` **in the selected repository**. It does not
fetch GitHub issues or periodically pull a remote branch. A normal clone's
`origin/ditz-metadata` remote-tracking ref alone is insufficient. The fresh-clone
fetch above creates the required local branch without switching source branches.

For an existing checkout, first check `git show-ref --verify
refs/heads/ditz-metadata`. If the branch is absent and its origin publishes this
format, run the same fetch there. If the branch already exists, do not force-fetch
over it; contributors reconcile through [Ditz sync](../AGENTS.md#issue-tracking-ditz).
Refresh tasks explicitly after metadata changes. A missing, malformed or stale
branch means unavailable/limited evidence, not zero tasks.

The Ditz CLI is **not required to read** existing tasks. To author or reconcile
them, the repository documents `nix run github:tedks/ditz -- <command>` and the
[contributor workflow](../AGENTS.md#issue-tracking-ditz); that is an additional
tool download, not part of the pinned Swarm flake or this installation proof.

## Stop, restart and update safely

Save any edits with Ctrl-S before Ctrl-C in the launch terminal. Rerun the same
launch command to reopen the same repository. To select a different repo, stop
and relaunch with `--workspace`; there is no promise of an in-app project picker.
For an update, inspect `git status` first and preserve your work, then pull an
appropriate reviewed revision, rerun the frozen install and desktop-bundle build,
and relaunch. Never reset the checkout just to make an update succeed.

Renderer edits use hot reload; many local-core edits recover in the same window.
Main-process changes need a deliberate restart. Reload guards are not backups
for crashes or discarded unsaved buffers. If desired, after stopping your own
launch, `nix develop --command bazel shutdown` stops this checkout's Bazel server.
Do not kill all Electron/Bazel processes or delete global caches to stop one demo.

## Troubleshooting

| Symptom | Next action |
| --- | --- |
| Git access denied / repository not found | Confirm the supplied repo URL and your access with the sender; do not change visibility or paste credentials into the IDE. |
| Nix says flakes or nix-command is disabled | Enable the two features above; open a new terminal if Nix is not yet on PATH. |
| Missing dependencies / Electron version mismatch | Use the pinned `nix develop` commands and repeat `pnpm install --frozen-lockfile`; do not upgrade packages independently. |
| `EADDRINUSE` / cannot listen | Pick another `SWARM_DEV_PORT`; leave the existing listener alone. |
| Workspace rejected | Pass the committed working-tree root, with correct quoting; check `git -C "/path/to/repo" rev-parse --show-toplevel`. |
| No display / sandbox or namespace denial | Run on the supported logged-in Linux/X11 host; report the exact host error instead of disabling safety controls. Headless verification below needs no physical desktop. |
| Empty or unavailable Tasks | Check the local metadata branch in the selected repo, then Refresh tasks. Do not infer that there is no work. |
| Build/service evidence unavailable or retained | Check its scope and diagnostic; use deliberate refresh/build only for trusted repos. Swarm's service example is not a universal detector. |
| No external agents | Register known sessions deliberately; [external observations](demo-agents.md) are read-only, not managed launches. |
| Trusted-local launch unavailable | Check installed Codex in the launch PATH, its normal account/configuration and the reported ownership-tool error. Prepare from a source-file draft, review and explicitly confirm. See [execution](trusted-local-execution.md); do not bypass host controls. |
| Launch read-only run disabled | This is the separate isolated profile's unverified policy gate, not trusted-local availability. |
| GitHub PRs unavailable | Check the opened checkout's github.com origin and normal `gh` login/configuration, then explicitly Refresh PRs. See [PR limits](logical-changelog.md#github-pull-requests). |

When reporting an installation failure, include the command, short `git rev-parse
--short HEAD`, host architecture and relevant terminal error, with private paths
and account details removed. Do not send raw agent transcripts or account files.

## Reproduce the installation check

From a source branch in the IDE checkout with local Ditz metadata available:

```bash
SWARM_VIRTUAL_DISPLAY=:134 SWARM_VIRTUAL_DESKTOP_PORT=55214 \
  nix develop --command bazel run --jobs=3 //tools/demo-install:smoke
```

This existing Bazel target makes a fresh local Git clone of the committed source,
fetches its local Ditz branch, creates new `node_modules` and Bazel outputs, builds
the bundle and runs workspace tests. It then runs the actual public dev command
on an owned Xvfb/Openbox desktop for the checkout and two disposable external Git
repos, including a path with spaces. It opens actual files, tests missing-workspace
and occupied-port rejection, and proves the external Bazel wrapper runs zero times
on ordinary opening and once after an explicit Build. No model turn is requested.

Choose a free virtual display/port pair, or omit `SWARM_VIRTUAL_DISPLAY` to let
the harness allocate a display. Another owner is never displaced. The three cases
are sequential; independent checkouts can use different pairs. Do not automate
your physical desktop. For a `bazel test` target rather than this `bazel run`
target, environment overrides also need explicit `--test_env` forwarding.

Inspect the printed `artifacts/demo-install/run.…` directory for
`installation-inputs.json`, `materialization.log`, `startup-rejections.json`,
per-case `source.png` and `supervisor.log`. Each case must finish with
`cleanup_complete=1`; the disposable clone is retained at the printed `/tmp`
path for inspection, but its owned GUI and Bazel processes are stopped.

This checks fresh source/dependency materialization **with shared warm Nix/pnpm
download caches**. It does not prove a cold-network install, remote GitHub account
access, installation of Nix itself, all host distributions or every demo feature.
The bundle at `bazel-bin/swarm-ide-foundation.tar.gz` is compiled app code, **not a
standalone installer**: it excludes Electron, the Nix/system runtime and your repo.

For other checks and hot-reload behavior, see
[development and visual verification](development-loop.md). For what to present
after the window opens, use the [connected tour](demo.md).
