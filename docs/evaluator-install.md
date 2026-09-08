# Open Swarm on a real project

Use the **installed Linux app** for the full local workflow. For a Mac evaluator,
the [Docker browser demo](container-demo.md) offers design and source browsing,
but not host-agent or live build execution. The source is private: the sender must
give you repository access or an authorized clone. No public installer/image is
published.

## Linux: first window

Use a normal user on Linux x86_64, with Git, Nix and an X11 desktop
(`DISPLAY` and any required `XAUTHORITY`). Nix needs `nix-command` and `flakes`
enabled. If necessary, add `extra-experimental-features = nix-command flakes`
to your existing `~/.config/nix/nix.conf`, preserving other settings.
The verified desktop was Xorg; native Wayland, macOS and ARM are not verified.
Keep the host's Electron sandbox and namespace support enabled.

From a new destination:

```bash
git clone git@github.com:tedks/swarm-ide.git
cd swarm-ide
nix run . -- --workspace "$PWD"
```

The first build downloads pinned runtime/build dependencies and bundles the app.
It does not require a manual pnpm install, a development server, a model account,
or a full test run. Leave the foreground command running while using the window.

Swarm's repository includes its own component design and source. To see its
tasks too, run this once in the **fresh clone**:

```bash
git fetch origin refs/heads/ditz-metadata:refs/heads/ditz-metadata
```

The task view notices local metadata-ref changes automatically. It does not
fetch remote changes itself. For an existing local branch, use Ditz sync rather
than force-fetching over work. Other projects need no Ditz setup to browse files.

Follow the [five-minute tour](demo.md). No agent account is required for the
design/source portion; a fresh install has no registered agents until you
connect some.

## Keep the command, then open another project

From the Swarm checkout:

```bash
nix profile install .#swarm-ide
swarm --workspace /absolute/path/to/your/project \
  --user-data-dir "$HOME/.config/swarm-ide-my-project"
```

Replace both example paths. The profile option keeps this window's history and
settings separate from another Swarm window; it does not copy or relocate Codex,
GitHub, Docker or tmux configuration. Without `--workspace`, `swarm` opens the
directory where you invoked it. Without installing, use
`nix run /path/to/swarm-checkout -- --workspace /path/to/project`.

Choose a Git **working-tree root with a committed HEAD**, not a subdirectory,
bare-repository parent or empty repository. In a multi-worktree layout use
`/home/me/Projects/project/master` or a specific feature worktree. On Linux,
linked worktrees work normally because their Git directory is accessible.
The container instead needs a standalone clone inside its mount.

The installed application lives in the Nix store and opens your chosen project.
Saving changes that project's files; simply opening it does not install its
dependencies. Source browsing works without Bazel or project-specific plans.
Available instruments depend on the actual repository and running local tools.
Bazel observation loads project-controlled definitions with your local permissions;
it is a query, not compilation. See [build graph coverage](dynamic-build-graph.md).

## Include agents already running in tmux

Install/authenticate your harness normally, outside Swarm. To follow existing
**Codex** owners in one session:

```bash
swarm --workspace /absolute/path/to/your/project \
  --user-data-dir "$HOME/.config/swarm-ide-my-project" \
  --tmux-server personal --tmux-session project
```

Replace `personal` and `project` with your actual server/session. The alternative
`--tmux-socket /absolute/path/to/socket --tmux-session project` selects a socket
directly. Association scans that session once, up to 64 panes. Shells, unsupported
harnesses and ambiguous owners may be skipped. If none are found, omit the tmux
flags to open the project alone.

For an already-maintained private registry, use this instead of tmux flags:

```bash
swarm --workspace /absolute/path/to/your/project \
  --user-data-dir "$HOME/.config/swarm-ide-my-project" \
  --agent-registry /absolute/private/agents.json
```

Registration observes existing processes; it does not create a second agent.
Closing the IDE or a conversation tab leaves those tmux agents running. New panes
need a new association or explicit registration. [Linux installation](linux-install.md)
covers skipped panes, generated registry paths and reuse.

Select a registered agent to read the conversation and Activity. The terminal
icon copies its checked attach command, so you can steer the same agent in tmux.
IDE messages remain copyable while queued. If receipt is unclear, inspect the
conversation or terminal before submitting again; do not resend just to clear
the label. Faster refresh and better receipt reconciliation are pending work.

## Optional model and GitHub actions

Browsing and observing do not request a model turn. Explicit trusted-local
launch uses your existing Codex installation, account, tools and approvals.
Use the Agent tools control to prepare a source-focused request, inspect the
prompt, and confirm launch. Unlike external tmux sessions, IDE-owned runs stop
with the app/core; saved history is not automatically resumed.
See [trusted-local execution](trusted-local-execution.md).

Work Log **Start** separately enables online summaries of registered work.
Its gear exposes the model settings; default is Codex `gpt-5.6-luna`. Leave it
stopped for a no-model tour. Saved outcomes remain readable.

For GitHub PRs, make normally authenticated `gh` available in the launch PATH.
Open **Activity → Pull requests → Refresh PRs**. This explicitly reads the
selected repository's supported github.com origin; it does not mutate PRs or
automatically poll them. Accounts and credentials are not bundled with Swarm.

## Stop, update and troubleshoot

Save with Ctrl-S, then close the window or interrupt the launch command.
Ordinary installed use requires no service-manager setup and no Vite port.
To update a clone, preserve local work, pull the chosen reviewed revision, and
run `nix profile install .#swarm-ide` from it again. Save/close the old app before
relaunching. For a reproducible fleet install use the
[pinned-revision command](linux-install.md#run-or-install).

| Symptom | Next action |
| --- | --- |
| Repository not found | Ask the sender to confirm access; no public artifact exists yet. |
| Nix command/features unavailable | Install Nix and enable flakes/nix-command; reopen the terminal if needed. |
| Workspace rejected | Check `git -C "/path/to/project" rev-parse --show-toplevel` and choose the committed worktree root. |
| No window or sandbox/namespace error | Report the exact host error and use a supported Linux/X11 environment. |
| Missing tasks | Check local `refs/heads/ditz-metadata` in that project, not just `origin/ditz-metadata`. |
| No agents | Use an existing Codex tmux session or maintained registry; opening a repo alone does not launch/discover them. |
| Message remains queued | Check that same conversation in tmux; keep the saved text rather than automatically resending. |
| Missing build/service information | Use the supported view explanation; queries do not infer arbitrary service deployments. |
| GitHub PRs unavailable | Check normal `gh` configuration and the selected repo's origin, then explicitly refresh. |

When reporting a failure, send the command, app revision, host architecture and
short error with private details removed—not account files or raw transcripts.

## What has actually been exercised

PR111 tested the x86_64-linux package build, `nix run` help, a disposable profile
installation, real source opening in another repository, and actual registered
Codex activity. Its tmux association proof found five selected-session agents;
the checked worker survived IDE close. Some panes were skipped.

PR112 tested Linux/amd64 Docker/noVNC keyboard navigation into the real app and
its renderer sandbox. It did not test macOS, ARM, Safari or live agent execution
in that container. See [container limits](container-demo.md#architecture-and-tested-limits).

Those are existing implementation proofs, not a fresh whole-tour execution of
this documentation revision. Maintainers can use
`nix develop --command bazel test --jobs=3 //tools/cli:checks` for CLI arguments;
package/owned-desktop reproduction is in [Linux installation](linux-install.md).
Source development and its separate install rehearsal remain documented in
[the development loop](development-loop.md).
