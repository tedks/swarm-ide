# Open the real desktop demo in a browser

This plan follows `.planning/PLANS.md` and is maintained as implementation proceeds.

## Purpose / Big Picture

An evaluator with Docker can build this checkout and open the actual Electron IDE in a browser without installing Nix or configuring a host X server. The container owns a Linux virtual display; noVNC carries its pixels and keyboard input over a localhost-only web port. The existing typed Electron bridge stays intact. This is not a browser-native rewrite or access to the Mac host's agents.

## Progress

- [x] 2026-09-08: Inspected the existing desktop bundle, Docker availability and official Electron, Docker, Nix and noVNC guidance.
- [x] 2026-09-08 14:01Z: Implemented nonroot runtime definition and included Git/design demo; actual Docker app bundle now builds in 8 seconds after one frozen install.
- [x] 2026-09-08 14:17Z: Complete runtime image and actual browser input/source-reading proof on Linux/amd64.
- [x] Exercise the actual container, browser transport and sandbox; 10 focused checks and native fix-delta review passed.
- [x] Document architecture and owned-process limits; push PR112 with independently usable local image.
- [ ] Finish final handoff and ROOT-owned landing.

## Assumptions and failure modes

Docker Engine/Desktop is already installed and the evaluator has source access. A cold image build needs network and several gigabytes. The host allows unprivileged Linux user namespaces under a documented container-specific syscall profile; launch fails rather than disabling Electron's sandbox if it does not. Only an explicitly mounted working tree is visible from the host. An occupied port fails without disturbing its owner. Closing the container must stop all of its display processes. The demo has no account, token, transcript or Docker socket mount.

## Surprises & Discoveries

The app requires `window.swarm` from Electron preload; serving Vite in a browser is not a working demo. The existing `//:desktop-bundle` tar contains the complete app/main/preload/core/renderer code but not Electron or Git/Bazel. Docker's default syscall policy denies the namespace preflight; the scoped profile passes it. The owned-process helper additionally needs a proc mount that remains denied, so live build-query/agent-run availability is explicitly outside this first browser demo. The host has Docker 29.6.2 on Linux/amd64; a local proof is not a macOS or arm64 proof.

The initial recursive bazel-* ignore excluded a real source module; correcting it to root outputs fixed that bundle failure. Bazel's daemon shutdown cannot reap its daemon correctly in the Docker build stage, so use `--batch`. Most build time was pnpm spawning install before every exec; after the explicit frozen install, disabling only that automatic repetition changed actual Bazel duration from434.639s to8.032s.

The copied D-Bus package needs its explicit session.conf path. The sandbox then failed receiving the zygote handshake: an independent A/B showed Docker's capability-conditional chroot rule disappeared with cap_drop ALL. Allowing only chroot permits Chromium to restrict its own filesystem inside its user namespace; no outer capability or mount authority was added. The changed full browser proof passed with renderer NSpid104/4/1, Seccomp2 and NoNewPrivs1. Separate docker-exec proof processes must load the packaged font environment and Xauthority explicitly. Chromium rewrites its process title, so the proof recognizes both space-separated and NUL-separated renderer argv.

## Decision Log

Use Xvfb, x11vnc and noVNC/websockify instead of creating a privileged HTTP API. Build runtime dependencies from the existing flake lock in `tools/container/runtime.nix`; retain the existing Bazel desktop bundle contract independently of the parallel Linux installer. Publish only localhost port 6080 and no raw VNC port, and require a fresh generated desktop password. Default to a disposable included Git repository with named-volume persistence, not a host source mount. Keep the four scoped syscall allowances clone/setns/unshare/chroot; do not add mount authority merely to make owned process controls work. Document that boundary and track it in `swarm-container-owned-processes`.

## Context and Orientation

`tools/build-app.sh`, invoked by `//:desktop-bundle`, creates `swarm-ide-foundation.tar.gz`. `app/electron/main.ts` loads its renderer and starts the core with `SWARM_WORKSPACE_ROOT`. New container code belongs entirely in `tools/container`, `Dockerfile`, `.dockerignore` and `compose.yaml`. The image uses a build stage for Nix/Bazel and a nonroot runtime stage containing only the copied runtime closure and bundle.

## Plan of Work

First add the build/runtime definition, startup script and tiny demo. The startup script starts its own X display and VNC/websocket services, checks its workspace, then supervises Electron and shuts down the remaining children if one exits. Next add Bazel-owned static and actual container smoke targets. Finally document one command, mount/persistence choices, exact sandbox requirements and tested architectures. Update the runtime design document; ask the plans owner to include the container target in the runtime graph rather than editing the shared index concurrently.

## Concrete Steps

From this designated worktree run `nix develop --command bazel run --jobs=3 //tools/container:checks` for direct checks. This manual uncached target reads actual root Docker configuration every time without requiring root BUILD changes or claiming global test coverage. Run `docker compose up --build` as the public Docker-only entry; its image build invokes Nix and Bazel. For recorded local acceptance run `nix develop --command bazel run --jobs=3 //tools/container:smoke`. Open `http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale` after readiness. Use `docker compose down` to stop; do not remove the named volume unless intentionally discarding saved demo edits.

## Validation and Acceptance

The actual Linux proof must load noVNC, render the real Swarm window and show a real committed demo source file; retain screenshot/logs. Verify the container is nonroot, no host mounts are present, only localhost HTTP is published and Electron does not contain `--no-sandbox`. Inspect live renderer sandbox process evidence and stop only the owned container. Static tests cover configured boundaries and script syntax. Report any unverified transport, architecture or sandbox boundary plainly.

## Idempotence and Recovery

Image builds can be repeated. Demo initialization must not overwrite an existing volume. A bad or absent mounted repository fails with a readable error. Smoke tests use uniquely named containers and temporary evidence paths, clean only those containers and retain evidence. No global Docker cleanup or shared preview changes.

## Interfaces and Dependencies

The production interface is the existing desktop tar and `SWARM_WORKSPACE_ROOT`; no provider/network schema changes. noVNC connects over a websocket to loopback-only x11vnc inside the container. Runtime packages are resolved from the pinned `flake.lock` for the build architecture. New Bazel targets are `//tools/container:checks` and `//tools/container:smoke`.

## Outcomes & Retrospective

The implemented Docker-only path builds and displays the actual Electron app without a browser backend rewrite. The actual browser opened a real committed source file, and independent process evidence confirmed the renderer sandbox. Final evidence is `/tmp/nix-shell.vbYSiX/swarm-container-proof.EOuDLc`; earlier failed attempts remain under the step's smoke/build logs with their corrections attributed. No Mac validation, persistent-volume restart proof, host-mounted write or public image is claimed. Follow-ups track actual Mac/ARM validation and the owned-process mount boundary. ROOT adopts/lands separately; no UI peer waits on this packaging branch.

## Artifacts and Notes

The working handoff is `/tmp/swarm-ide-usability.BirZCk/mac-demo/seam.md`. Final verification and a marker-qualified recap go in the same step directory. This initial revision records concrete runtime and sandbox constraints before implementation.
