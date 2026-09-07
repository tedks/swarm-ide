# Parallel owned virtual desktops

Separate implementation worktrees can run packaged navigation and task tests
on different virtual X11 displays and loopback ports. No physical display,
central allocation service, or global desktop mutex is needed. Use the existing
owned harness; do not launch an untracked X server.

For a full suite in one worktree:

```sh
nix develop --command bazel test --jobs=3 //... \
  --test_env=SWARM_VIRTUAL_DISPLAY=:126 \
  --test_env=SWARM_VIRTUAL_DESKTOP_PORT=55206
```

A second worktree may run the same command with `:127` and `55207`. Explicit
`--test_env` forwarding matters: the environment inherited by Bazel tests does
not automatically include every shell variable. Existing exclusive test tags
still serialize desktop tests **within** one Bazel invocation; separate
worktrees can proceed independently. Run only one full suite per worktree.

For a focused packaged journey:

```sh
SWARM_VIRTUAL_DISPLAY=:126 SWARM_VIRTUAL_DESKTOP_PORT=55206 \
  nix develop --command bazel run --jobs=3 //tools/repository-navigation:smoke

SWARM_VIRTUAL_DISPLAY=:127 SWARM_VIRTUAL_DESKTOP_PORT=55207 \
  nix develop --command bazel run --jobs=3 //tools/task-integration:smoke
```

Choose unused resources; the numbers above are examples, not reservations or
permission gates. Omit `SWARM_VIRTUAL_DISPLAY` to use the existing automatic
free-display search. Omit or empty `SWARM_VIRTUAL_DESKTOP_PORT` to retain the
default **55174**. The harness rejects occupied ports/displays without killing
their owners. Keep the shared display-lock root `/tmp`; changing it independently
would defeat collision detection. Never use display `:0` for automation.

Both package launchers validate the supervisor's resolved `SWARM_DEV_PORT`
against its allocation and exact loopback window marker, together with the
private owner token, display and Xauthority record. Malformed or mismatched
contexts fail before binding. The readiness servers bind only `127.0.0.1`.
Each harness run continues to own a private runtime, profile, Xauthority and
process sessions, with `cleanup_complete=1` recorded only after owned teardown.
This is accidental-cross-run protection, not a sandbox against malicious code
running as the same operating-system user.

Focused validation is `nix develop --command bazel test --jobs=3
//tools/task-integration:owned-port-test`. It covers default and nondefault
ports, malformed values, allocation/marker mismatch, missing/mismatched owner
records and unsafe metadata. These synthetic ownership cases supplement,
rather than replace, actual packaged GUI concurrency evidence.

The first S1 execution observed both distinct readiness servers simultaneously
on `:126/55206` and `:127/55207`. The task journey and three navigation cases
passed; the unfamiliar-repository task Reveal timed out waiting for `src`.
All five desktop runs reported complete cleanup, independently checked against
their saved process/runtime identities. That unresolved acceptance failure is
tracked as `parallel-port-navigation-reveal-timeout-20260907`: concurrency is
proved, but this run is not evidence of a fully green navigation suite or of
the cause of that failure.
