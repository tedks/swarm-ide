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

The flake exposes x86_64-linux and aarch64-linux. Actual package/GUI evidence must
name the tested architecture; exposing the second output does not prove it was
run. macOS is not a native target of this package. The separate container demo
work supplies an evaluator option, with its own host-integration limits.

The Nix derivation builds through `//:desktop-bundle`. It fetches locked pnpm
packages and Bazel's built-in workspace dependencies as fixed build inputs,
installs JavaScript dependencies offline, and bundles in a network-restricted
build. It uses Bazel's legacy workspace mode only inside the package because the
Nix Bazel dependency archive does not retain Bzlmod registry metadata. The normal
development build keeps its existing module configuration.
