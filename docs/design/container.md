# Container desktop for evaluators

The container is another way to reach the existing desktop, not another backend.
Its browser receives display pixels and sends keyboard/pointer input; all source,
Git, graph and agent requests still pass through the normal sandboxed renderer →
preload → Electron main → typed local core boundary.

```text
host browser
  │ localhost HTTP + WebSocket, desktop password
  ▼
noVNC / websockify ── private loopback VNC ── x11vnc
                                                 │
                                            owned Xvfb display
                                                 │
                                            Electron desktop
                                                 │ typed IPC
                                              local core
                                                 │
                                      included or explicit mounted repo
```

`Dockerfile` builds the existing `//:desktop-bundle` with the pinned flake and
Bazel, then copies its `app/`, `core/` and `renderer/` into a nonroot runtime.
`tools/container/runtime.nix` selects the matching Linux Electron, Git/Bazel,
fonts, display and browser-transport dependencies from `flake.lock`.
`tools/container/entrypoint.sh` initializes the included Git sample only on an
empty data volume, validates a selected repo root, checks namespace capability,
starts its display/app children and stops them together.

The only network surface published is localhost port 6080; raw VNC is private to
the container. A fresh local desktop password prevents unauthenticated control.
Compose drops capabilities, keeps no-new-privileges and uses a documented
deny-by-default syscall policy with Chromium namespace calls enabled. Failure to
create the sandbox stops launch rather than changing Electron's sandbox setting.

Actual target connections:

| Target | Inputs / effect |
| --- | --- |
| `//:desktop-bundle` | Existing `//:quality_sources` and `//tools:build-app`; creates the app tar consumed by the Docker build |
| `//tools/container:sources` | Container startup, runtime definition, policy and small sample repo |
| `//tools/container:checks` | Manual uncached command reading root Dockerfile/Compose/build-context rules plus container sources; direct configuration and sample checks |
| `//tools/container:smoke` | Container sources and a locally built image; starts an owned container and verifies real Electron through noVNC |

The named data volume holds app state and demo edits. An explicit host repo mount
is the only path to host source; read-only mounts cannot save. Host tmux sessions,
agents, accounts, Docker daemons and dev-server ports are not inherited. Native
Linux installation remains separate and owns noVNC-free desktop startup.

Update this document and [the setup guide](../container-demo.md) when changing
the display boundary, image runtime or mount behavior. Linux/amd64 proof is not
macOS/arm64 proof. Neither this target nor its tests publishes an image.
