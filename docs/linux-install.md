# Install the Linux cockpit

Swarm can run as an installed desktop command. You do not need to keep a Vite
server or a source checkout running after installation. This path requires Linux,
Nix with flakes enabled, and a working graphical session. It does not install or
authenticate an agent harness for you.

## Run or install

From a clone of the [public repository](https://github.com/tedks/swarm-ide):

```sh
nix run . -- --workspace /absolute/path/to/your/project
nix profile install .#swarm-ide
cd /absolute/path/to/your/project
swarm-ide
```

You can also run or install directly from GitHub, without cloning or setting up
SSH access:

```sh
nix run github:tedks/swarm-ide -- --workspace /absolute/path/to/your/project
nix profile install github:tedks/swarm-ide#swarm-ide
```

The first build downloads pinned build/runtime dependencies and assembles the
production bundle. Subsequent invocations of `swarm` run the installed bundle;
`nix run` reuses an unchanged cached build. For a repeatable fleet rollout, pin a
landed revision with `github:tedks/swarm-ide/COMMIT#swarm-ide`, replacing `COMMIT`
with the chosen full commit ID. Accounts and credentials stay on each user's host.

For later updates, use `nix profile list` to find the Swarm entry's actual
**Name**, then `nix profile upgrade NAME`. If its source is your local clone,
first preserve local work and pull the intended reviewed revision there.
Do not repeat `profile install` to update an existing entry: it can collide with
the installed `swarm` command. A commit pin stays fixed; deploying a new
fleet revision requires choosing a new pin rather than expecting upgrade to
advance it. Save and close the old window before launching the updated app.

## Choose the project

`swarm-ide` (or the equivalent `swarm` alias) discovers the project from the
current directory. A source subdirectory opens its Git worktree root. In a bare
repository with linked worktrees, it opens the last valid choice, otherwise the
default/main/master worktree, then a stable existing fallback. Both a direct
bare Git directory and the common `project/.git` plus worktree-children layout
work. No worktree is created or checked out. A bare repository with none reports
that you need to create one first.

`--workspace` explicitly chooses another project/worktree and resolves relative
to where you typed the command, including paths with spaces:

```sh
cd /home/me/Projects
swarm --workspace 'my project'
swarm --workspace ../another-checkout
swarm --help
```

Use an existing Git repository with a committed HEAD for full repository/task
navigation. Ordinary non-Git directories still open for inspection, with fewer
repository features. Only the container requires a standalone clone inside its
mount; the native Linux command understands linked worktrees.
The command rejects missing directories and unknown options instead of silently
opening its installation directory. The IDE trusts your chosen local project and
tools; deliberate build or agent actions may execute those tools normally.

## Connect an existing tmux swarm

For a first look at another project, no agent setup is needed:

```sh
cd "$HOME/Projects/puresky"
swarm-ide
```

Replace the project name with yours. Settings and a separate worktree profile
are created automatically. You can also use `--workspace` from any directory.
Without installing first, use `nix run /path/to/swarm-checkout --` followed by
the same flags. Continue with the [five-minute tour](demo.md).

When invoked inside tmux, the command automatically checks the current pane's
socket/session and associates discoverable Codex owners whose actual worktree
belongs to this project. Other projects in that tmux session are excluded. If
an owner's process cwd is this project's bare-repository parent rather than a
worktree, Swarm uses the same validated worktree selection described above as
its browsing root. This does not change the agent's cwd or claim where it edits.
An owner already in a sibling feature worktree keeps that exact worktree. If
current-session discovery is unavailable or finds no owners, the project still
opens using its saved private registry. No attach, send, resume or agent launch
is performed. A newly launched session is discovered on the next invocation,
not by a new background scanner.

Explicit options can choose the project and exact tmux session independently. Agents can
have sibling worktrees; their source links use each checked owner's actual Git
worktree, not the project shown by the main directory browser.
The agent's **Worktree** icon or the sidebar's **Worktree** selector switches the
main workspace among registered worktrees of the same repository. Choose
**Launch workspace** to return. For a different repository, open another window.

```sh
swarm --workspace ~/Projects/goals/master --tmux-server personal --tmux-session goals
# Or select a socket explicitly, including one outside tmux's default directory:
swarm --workspace ./project --tmux-socket /absolute/path/to/socket --tmux-session project
```

This performs one bounded scan of that session (at most 64 panes), reusing Swarm's
exact process/rollout registration checks. It does not scan every tmux server or
the account's conversation history. It currently recognizes Codex owners with
one discoverable open rollout, or one CLI with directly linked native helpers
in the same process. The same-project bare-parent browsing mapping also applies
to this explicit path and requires matching canonical Git common-directory
identity plus a still-valid selected worktree; shells, ambiguous owners and
unavailable or unrelated roots are skipped. If nothing can be registered, the command explains that before
opening a window; remove the tmux flags to open the project by itself.

Discovery is deliberately bounded and can skip busy or ambiguous panes. Direct
native children are recognized from their headers; deeper or missing-parent
lineage is not guessed. If an expected agent is absent, use its existing checked
registry with `--agent-registry`. Both paths have been exercised with actual
agents, but automatic discovery is not a promise to find every pane.

If that project already has Codex owners in `personal:puresky`, add
`--tmux-server personal --tmux-session puresky` to the example above. A session
containing only shells or another harness is not a Codex fleet.

The command prints the private registry path and an exact tmux attach command.
In the IDE, selecting a checked agent exposes the existing per-agent terminal
navigation/copy action. The terminal and IDE refer to the same running owner.
Closing or restarting Swarm does not close tmux, clone/resume an agent, or send a
message. Activity refreshes live for registered agents. Discovering newly created
panes requires another explicit association or adding them through the existing
checked registration tool; this launcher adds no background discovery daemon.

Each association writes a fresh private generation under the project's state
directory (described below). This prevents a restarted
server from inheriting another session's conversations, and avoids a permanent
64-lifetime-agent limit. Prior registries remain private history, but are not
silently mixed into a new association. To reuse an explicitly maintained or
previous registry instead of scanning tmux:

```sh
swarm --workspace ./project --agent-registry /absolute/private/agents.json
```

An existing `SWARM_EXTERNAL_AGENTS_REGISTRY` also remains supported. Explicit
tmux flags replace it for that invocation. An old registry can contain historical
agents; the core still rechecks live ownership before allowing steering. This is
a Linux host feature, not a claim that the Mac container can see host tmux.

## State and tools

Application files live in the immutable Nix store. Electron uses the application
name `swarm-ide`. Startup creates a small versioned configuration at
`${XDG_CONFIG_HOME:-$HOME/.config}/swarm-ide/projects/<project-key>/project.json`.
The readable project key includes a digest of the canonical Git common-directory
path: linked worktrees share project identity, unrelated repositories do not.
It remembers the most recently chosen valid worktree and the latest associated
registry. Settings and registry files are private (0600); directories are 0700.

The private registry and one reusable Electron profile **per worktree** live
under `${XDG_STATE_HOME:-$HOME/.local/state}/swarm-ide/projects/<project-key>/`.
Opening two different worktrees therefore does not share their drafts/history or
Electron profile. Settings never go into source or the Nix store. A malformed
settings/managed-registry file is reported and left unchanged, not reset. Moving
the whole Git common directory creates a new project identity. Existing older
global profiles are not moved or deleted; select one explicitly if desired:

```sh
swarm --workspace ./project --user-data-dir "$HOME/.config/swarm-ide-my-project"
```

Explicit profile/registry flags override only this invocation; they do not replace
the defaults saved for later launches. This option does not move GitHub, Codex,
tmux, Docker or other host configuration.
The launcher preserves the host environment and supplies Node, Git, tmux and
util-linux. It provides the pinned Bazel/Java runtime for existing build-graph
queries. Your normal `PATH` still supplies Codex/other harnesses, GitHub CLI,
Docker and other optional tools. Those integrations show only what is available;
installing Swarm neither starts an agent nor copies credentials.

To start one, click **New agent** beside the conversation tabs, check the
workspace, type a task and press Enter. Optional Settings chooses the model.
It uses your installed Codex account and approvals; no registry or source-file
draft is needed. IDE-owned runs stop when the app/core closes, unlike the
external tmux agents described above.

Installed launch clears inherited `SWARM_RENDERER_URL` and `SWARM_DEV_CONTROL`
so it cannot accidentally load an old development server or watch a stale reload
file. Existing `nix develop --command bazel run //:dev` remains the development path.

No service manager is needed for ordinary use: `swarm` is a foreground desktop
application. Close the window or interrupt that command normally. The package
does not disable Electron's sandbox. The existing explicit
`SWARM_ELECTRON_NO_SANDBOX=1` escape hatch remains an operator decision for hosts
whose policy cannot support Chromium's sandbox; it is never set automatically.

## Maintainer checks and platform limits

```sh
nix develop --command bazel test --jobs=3 //tools/cli:checks
nix build .#swarm-ide
nix develop --command bazel run --jobs=3 //tools/cli:smoke -- "$(readlink -f result)"
# Also prove zero-argument selection from a disposable bare parent:
SWARM_CLI_TEST_BARE=1 nix develop --command bazel run --jobs=3 //tools/cli:smoke -- "$(readlink -f result)"
```

The smoke target creates an owned virtual X11 desktop, launches the installed
command against a disposable Git repository from a different directory, opens
its real source through the normal palette, and captures the result. Its small
loopback server is only the test harness's readiness handshake; renderer assets
still load from the installed `file://` bundle.

This increment was built and run on x86_64-linux, including a disposable Nix
profile installation and real source opening on an owned virtual desktop. The
flake's aarch64-linux output evaluates but has not been built or run here.
macOS is not a native target of this package. The separate [container demo](container-demo.md)
is a design/source browsing option. Its current profile cannot run owned agent
or live Bazel-query subprocesses, and it cannot observe Mac host agents.

The Nix derivation builds through `//:desktop-bundle` and
`//tools/cli:registration-bundle`. It fetches locked pnpm
packages and Bazel's built-in workspace dependencies as fixed build inputs,
installs JavaScript dependencies offline, and bundles in a network-restricted
build. It uses Bazel's legacy workspace mode only inside the package because the
Nix Bazel dependency archive does not retain Bzlmod registry metadata. The normal
development build keeps its existing module configuration.
