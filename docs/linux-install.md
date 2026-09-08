# Install the Linux cockpit

Swarm can run as an installed desktop command. You do not need to keep a Vite
server or a source checkout running after installation. This path requires Linux,
Nix with flakes enabled, and a working graphical session. It does not install or
authenticate an agent harness for you.

## Run or install

From a checkout you can access:

```sh
nix run . -- --workspace /absolute/path/to/your/project
nix profile install .#swarm-ide
swarm --workspace /absolute/path/to/your/project
```

The source repository is private during prototyping. Use your existing Git access
to clone it; no public download or image is implied by these commands. You can
also install directly with your existing SSH access:

```sh
nix profile install 'git+ssh://git@github.com/tedks/swarm-ide?ref=master#swarm-ide'
```

The first build downloads pinned build/runtime dependencies and assembles the
production bundle. Subsequent invocations run that installed bundle, not a build.
For a repeatable fleet rollout, replace `ref=master` with `rev=COMMIT` after the
chosen commit has landed. Do not share your SSH keys or agent configuration with
evaluators.

## Choose the project

`swarm` with no arguments opens the invocation directory. `--workspace` resolves
relative to the directory where you typed the command, including paths with spaces:

```sh
cd /home/me/Projects
swarm --workspace 'my project'
swarm --workspace ../another-checkout
swarm --help
```

Choose an existing Git worktree for repository, task and source navigation.
The command rejects missing directories and unknown options instead of silently
opening its installation directory. The IDE trusts your chosen local project and
tools; deliberate build or agent actions may execute those tools normally.

## Connect an existing tmux swarm

Choose the project and the exact tmux server/session independently. Agents can
have sibling worktrees; their source links use each checked owner's actual Git
worktree, not the project shown by the main directory browser.

```sh
swarm --workspace ~/Projects/goals/master --tmux-server personal --tmux-session goals
# Or select a socket explicitly, including one outside tmux's default directory:
swarm --workspace ./project --tmux-socket /absolute/path/to/socket --tmux-session project
```

This performs one bounded scan of that session (at most 64 panes), reusing Swarm's
exact process/rollout registration checks. It does not scan every tmux server or
the account's conversation history. It currently recognizes Codex owners with
one discoverable open rollout, or one CLI with directly linked native helpers
in the same process; shells, ambiguous owners and unavailable worktree
roots are skipped. If nothing can be registered, the command explains that before
opening a window; remove the tmux flags to open the project by itself.

Discovery is deliberately bounded and can skip busy or ambiguous panes. Direct
native children are recognized from their headers; deeper or missing-parent
lineage is not guessed. If an expected agent is absent, use its existing checked
registry with `--agent-registry`. Both paths have been exercised with actual
agents, but automatic discovery is not a promise to find every pane.

The command prints the private registry path and an exact tmux attach command.
In the IDE, selecting a checked agent exposes the existing per-agent terminal
navigation/copy action. The terminal and IDE refer to the same running owner.
Closing or restarting Swarm does not close tmux, clone/resume an agent, or send a
message. Activity refreshes live for registered agents. Discovering newly created
panes requires another explicit association or adding them through the existing
checked registration tool; this launcher adds no background discovery daemon.

Each association writes a fresh private generation under
`${XDG_STATE_HOME:-$HOME/.local/state}/swarm-ide/fleets/`. This prevents a restarted
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
name `swarm-ide`, so its normal Linux profile/history lives under
`${XDG_CONFIG_HOME:-$HOME/.config}/swarm-ide`, separate from installed files.
To use a separate window/history profile:

```sh
swarm --workspace ./project --user-data-dir ./scratch/swarm-profile
```

This option does not move GitHub, Codex, tmux, Docker or other host configuration.
The launcher preserves the host environment and supplies Node, Git, tmux and
util-linux. It provides the pinned Bazel/Java runtime for existing build-graph
queries. Your normal `PATH` still supplies Codex/other harnesses, GitHub CLI,
Docker and other optional tools. Those integrations show only what is available;
installing Swarm neither starts an agent nor copies credentials.

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
```

The smoke target creates an owned virtual X11 desktop, launches the installed
command against a disposable Git repository from a different directory, opens
its real source through the normal palette, and captures the result. Its small
loopback server is only the test harness's readiness handshake; renderer assets
still load from the installed `file://` bundle.

This increment was built and run on x86_64-linux, including a disposable Nix
profile installation and real source opening on an owned virtual desktop. The
flake's aarch64-linux output evaluates but has not been built or run here.
macOS is not a native target of this package. The separate container demo
work supplies an evaluator option, with its own host-integration limits.

The Nix derivation builds through `//:desktop-bundle` and
`//tools/cli:registration-bundle`. It fetches locked pnpm
packages and Bazel's built-in workspace dependencies as fixed build inputs,
installs JavaScript dependencies offline, and bundles in a network-restricted
build. It uses Bazel's legacy workspace mode only inside the package because the
Nix Bazel dependency archive does not retain Bzlmod registry metadata. The normal
development build keeps its existing module configuration.
