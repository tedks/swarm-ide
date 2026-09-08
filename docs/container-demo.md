# Open the demo in a browser with Docker

This runs the **real Linux Electron app** on a desktop inside a container. Your
browser displays that desktop through noVNC. You do not need Nix or an X server
on your Mac, and no model account is required to explore the included project.
This is a local evaluation path, not a public web service.

**Choose this for a design/source demo, not live swarm orchestration.** The
current container cannot run owned agent or Bazel-query subprocesses or observe
Mac host agents. Linux/amd64 Docker was tested; Mac, Apple Silicon and Safari
were not. For the full local workflow use the [installed Linux app](linux-install.md).

## Start

Install and start [Docker Desktop for your Mac](https://docs.docker.com/desktop/setup/install/mac-install/),
or use an existing Linux Docker Engine with Compose. The source repository still
requires access from its owner. In a clone of the supplied source, run:

```bash
docker compose up --build
```

The first image build downloads the pinned Nix dependencies and builds the app
through Bazel. Allow several gigabytes of disk and download space; this is not a
small prebuilt image download. Subsequent starts reuse the image.

Open [the local desktop](http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale)
and enter the **desktop password printed in the launch terminal**. A fresh random
password is created on each start; it is not your host password or an agent token.
If that port is occupied, stop this launch and use an unused port:

```bash
SWARM_DEMO_PORT=6081 docker compose up
```

Then open port 6081 in the same URL. Nothing kills or replaces an existing server.

## Try the included project

The default project is **Market Pulse**, a small committed Git repository. Read
its design, follow the quote-adapter/spread-engine relationship, and open
`src/spread.ts` through the file palette. The build declarations connect actual
source filegroups; there are no invented running agents or deployments.

The current container supports reading those declarations and following authored
design/source links. **Live Bazel graph queries and agent subprocess runs are not
available under this container profile**: their owned-process helper additionally
needs a private proc mount. This demo does not expand mount permissions to enable
them. Use the native Linux install for the full agent/build workflow.

Edit a comment and save it. The repository and app state live in the `demo-data`
named volume. Ctrl-C stops the attached launch; `docker compose down` removes its
container/network without deleting the volume. Restart with `docker compose up`.
Do not add `--volumes` unless you deliberately want to discard saved demo work.
Unsaved editor text is not a backup; save before stopping.

## Bring one repository, explicitly

Use a normal standalone Git clone with a committed HEAD. A worktree whose `.git`
file points outside the mounted directory is insufficient. Stop the default
demo first, then mount only the clone you intend to expose:

```bash
docker compose run --rm --service-ports \
  --volume "/absolute/path/to/clone:/workspace:ro" demo /workspace
```

The read-only mount permits browsing; attempts to save to it fail. For editing,
deliberately change `:ro` to `:rw`: saves then change that host clone. On Linux the
container's UID 1000 needs appropriate access to those files; do not solve a
permission problem by running the container as root or mounting your whole home.
Task reading needs that clone's local `ditz-metadata` branch. No Git history or
Ditz branch from the Swarm checkout is silently copied into the demo image.

The container sees **container** repositories, processes, ports and tmux. It does
not discover or steer your Mac host's agents. Codex/other harnesses and account
credentials are not installed or mounted. Authenticated agent runs also need a
different supported process profile; adding credentials alone does not enable
them in this image.
URLs for a dev server inside the container require an explicit additional port
mapping before the host browser can reach them. There is no bundled host browser
for opening arbitrary external links from the streamed Linux desktop.

## Sandbox and network choices

Compose publishes only `127.0.0.1:6080`. Raw VNC stays on container loopback. There
is no Docker socket, host X11 socket, home directory or account mount, no added
Linux capability, and no privileged mode. The app runs as UID 1000 with Electron's
renderer sandbox and context isolation intact.

Chromium needs Linux user namespaces for its sandbox. Docker's default syscall
profile may deny them. The included `tools/container/seccomp.json` is the Moby
profile at commit `61eaf32614c7c71b60bd8927d3e6a4ffc8ff1f31`, with one explicit
allow rule for `clone`, `setns`, `unshare` and `chroot`. The last lets Chromium
restrict its own filesystem after creating its user namespace; with all outer
capabilities dropped, the upstream capability-conditional rule would deny it.
No outer capability or mount permission is added. It otherwise keeps the upstream
deny-by-default policy. This is a scoped permission expansion, not the unchanged
Docker default. Compose also drops all capabilities and enables no-new-privileges.
The launch checks namespace availability and stops if denied; it never retries
with `--no-sandbox`, `--privileged` or unconfined security policies.

Do not publish this desktop publicly or change the binding to `0.0.0.0`. The local
VNC password is an additional guard, not an internet-facing authentication/TLS
design. Anyone granted access to the desktop can operate the container app and
any repository mounted writable into it.

Docker build's Nix setting `sandbox=false` describes Nix build isolation *inside*
Docker's builder. It does not disable Electron's runtime sandbox.

The image installs the frozen lockfile once before Bazel, then disables pnpm's
automatic dependency re-install before each build command. Dependency versions
remain the frozen inputs; this avoids seven redundant install cycles during
bundling, not a change to the app's runtime or host package-manager settings.

## Architecture and tested limits

The Dockerfile selects the build machine's Linux architecture, without forcing
Intel emulation. The Nix base image publishes Linux amd64 and arm64 manifests;
the existing flake declares `x86_64-linux` and `aarch64-linux`. Docker Desktop
provides native Linux/arm64 containers on Apple Silicon. No native macOS app is
built here. Do not use `--platform linux/amd64` as a claimed Apple Silicon fix:
emulation can be slower and Electron's sandbox under emulation is not validated.

**Verified locally on Linux/amd64:** Docker built the actual image; the noVNC
browser authenticated, sent keyboard input through VNC and opened the included
README in the real IDE. The live app renderer had a nested PID namespace,
seccomp enabled and no-new-privileges. The owned container was removed cleanly.
The 10 direct checks also passed. An amd64 container test is not a macOS, Apple Silicon, Safari or
Docker Desktop test. Those remain evaluator-platform follow-ups until actually
run. If a platform denies user namespaces, report its exact error and use the
[Linux installed path](linux-install.md); do not disable host security controls.

## Developer checks

From the source checkout with Nix installed:

```bash
nix develop --command bazel run --jobs=3 //tools/container:checks
docker compose build
nix develop --command bazel run --jobs=3 //tools/container:smoke
```

The checks target is a manual, uncached command: it reads the actual checkout's
Dockerfile, Compose and ignore rules each time. It does not pretend these root
configuration files are cached Bazel test inputs or belong to `bazel test //...`.

The smoke target uses the built `swarm-ide-demo:local` image, a unique container,
owned virtual desktop and port 55418. Override `SWARM_CONTAINER_PORT` if needed.
It loads the actual noVNC browser client, connects to the running Electron
desktop, and saves a screenshot and process evidence under a printed temporary
directory. This proves browser input and source reading, not a host-mounted
write, persistent-volume restart or model turn. It removes only its own container, never shared Docker volumes/caches
or a user's desktop. There is no model request in this proof.

## Why this design

[Electron's sandbox documentation](https://www.electronjs.org/docs/latest/tutorial/sandbox)
describes its renderer/IPC boundary. [noVNC](https://github.com/novnc/noVNC) supplies
the browser display client; websockify translates its WebSocket to VNC.
[Docker's syscall documentation](https://docs.docker.com/engine/security/seccomp/)
explains the namespace restrictions; [Playwright's upstream container guidance](https://playwright.dev/docs/docker)
uses a nonroot Chromium user and scoped namespace allowance as well.
[Nix's container documentation](https://nix.dev/manual/nix/2.31/installation/installing-docker.html)
describes the build image, and [Docker's multi-platform guide](https://docs.docker.com/build/building/multi-platform/)
distinguishes native targets from emulation.

The image is built locally only. This work does not publish an image, change
repository access or include private transcripts/configuration in the build context.
