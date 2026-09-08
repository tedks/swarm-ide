# Open the real desktop demo in a browser

This plan follows `.planning/PLANS.md` and is maintained as implementation proceeds.

## Purpose / Big Picture

An evaluator with Docker can build this checkout and open the actual Electron IDE in a browser without installing Nix or configuring a host X server. The container owns a Linux virtual display; noVNC carries its pixels and keyboard input over a localhost-only web port. The existing typed Electron bridge stays intact. This is not a browser-native rewrite or access to the Mac host's agents.

## Progress

- [x] 2026-09-08: Inspected the existing desktop bundle, Docker availability and official Electron, Docker, Nix and noVNC guidance.
- [ ] Build a nonroot runtime from pinned repository dependencies and include a small editable demo repository.
- [ ] Exercise the actual container, browser transport and sandbox; run focused checks and native review.
- [ ] Document architecture limits, push a ready PR and hand off to ROOT.

## Assumptions and failure modes

Docker Engine/Desktop is already installed and the evaluator has source access. A cold image build needs network and several gigabytes. The host allows unprivileged Linux user namespaces under a documented container-specific syscall profile; launch fails rather than disabling Electron's sandbox if it does not. Only an explicitly mounted working tree is visible from the host. An occupied port fails without disturbing its owner. Closing the container must stop all of its display processes. The demo has no account, token, transcript or Docker socket mount.

## Surprises & Discoveries

The app requires `window.swarm` from Electron preload; serving Vite in a browser is not a working demo. The existing `//:desktop-bundle` tar contains the complete app/main/preload/core/renderer code but not Electron or Git/Bazel. Docker's default syscall policy can deny Chromium's namespace sandbox, so this must be exercised before a launch claim. The host has Docker 29.6.2 on Linux/amd64; a local proof is not a macOS or arm64 proof.

## Decision Log

Use Xvfb, x11vnc and noVNC/websockify instead of creating a privileged HTTP API. Build runtime dependencies from the existing flake lock in `tools/container/runtime.nix`; retain the existing Bazel desktop bundle contract independently of the parallel Linux installer. Publish only localhost port 6080 and no raw VNC port. Default to a disposable included Git repository with named-volume persistence, not a host source mount.

## Context and Orientation

`tools/build-app.sh`, invoked by `//:desktop-bundle`, creates `swarm-ide-foundation.tar.gz`. `app/electron/main.ts` loads its renderer and starts the core with `SWARM_WORKSPACE_ROOT`. New container code belongs entirely in `tools/container`, `Dockerfile`, `.dockerignore` and `compose.yaml`. The image uses a build stage for Nix/Bazel and a nonroot runtime stage containing only the copied runtime closure and bundle.

## Plan of Work

First add the build/runtime definition, startup script and tiny demo. The startup script starts its own X display and VNC/websocket services, checks its workspace, then supervises Electron and shuts down the remaining children if one exits. Next add Bazel-owned static and actual container smoke targets. Finally document one command, mount/persistence choices, exact sandbox requirements and tested architectures. Update the runtime design document; ask the plans owner to include the container target in the runtime graph rather than editing the shared index concurrently.

## Concrete Steps

From this designated worktree run `nix develop --command bazel test --jobs=3 //tools/container:checks` for direct checks. Run `docker compose up --build` as the public Docker-only entry; its image build invokes Nix and Bazel. For recorded local acceptance run `nix develop --command bazel run --jobs=3 //tools/container:smoke`. Open `http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale` after readiness. Use `docker compose down` to stop; do not remove the named volume unless intentionally discarding saved demo edits.

## Validation and Acceptance

The actual Linux proof must load noVNC, render the real Swarm window and show a real committed demo source file; retain screenshot/logs. Verify the container is nonroot, no host mounts are present, only localhost HTTP is published and Electron does not contain `--no-sandbox`. Inspect live renderer sandbox process evidence and stop only the owned container. Static tests cover configured boundaries and script syntax. Report any unverified transport, architecture or sandbox boundary plainly.

## Idempotence and Recovery

Image builds can be repeated. Demo initialization must not overwrite an existing volume. A bad or absent mounted repository fails with a readable error. Smoke tests use uniquely named containers and temporary evidence paths, clean only those containers and retain evidence. No global Docker cleanup or shared preview changes.

## Interfaces and Dependencies

The production interface is the existing desktop tar and `SWARM_WORKSPACE_ROOT`; no provider/network schema changes. noVNC connects over a websocket to loopback-only x11vnc inside the container. Runtime packages are resolved from the pinned `flake.lock` for the build architecture. New Bazel targets are `//tools/container:checks` and `//tools/container:smoke`.

## Outcomes & Retrospective

Implementation and actual Docker proof are pending; no Mac validation or public image is claimed.

## Artifacts and Notes

The working handoff is `/tmp/swarm-ide-usability.BirZCk/mac-demo/seam.md`. Final verification and a marker-qualified recap go in the same step directory. This initial revision records concrete runtime and sandbox constraints before implementation.
