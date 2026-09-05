# Development and visual verification

Enter every supported path through Nix and Bazel from the feature worktree:

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel build //...
    nix develop --command bazel test //...
    nix develop --command bazel run //:dev

Keep the development command running. In another terminal, exercise the actual
desktop window:

    nix develop --command bazel run //tools:desktop-smoke
    nix develop --command bazel run //tools:measure-hmr

The desktop smoke driver uses `wmctrl`, `xdotool`, and ImageMagick from the Nix
shell. It resolves the Electron window by ID even when it is on another
workspace, activates that exact window before each capture, uses `Ctrl-K`, types
a fixture reset, captures the command palette, clicks the reconciliation
command, captures yellow and green, asserts exact revision/title transitions,
and requires a material screenshot change. Screenshots read only the selected X
window resource; they never capture the root desktop. Artifacts are written
under ignored `artifacts/desktop/`.

The HMR probe makes a reversible hue edit to `app/renderer/hmr-probe.css`, polls
a dedicated 48×48 screen region inside the selected Electron window, watches for
an exact HMR generation increment in the title, and restores the file. On
2026-09-05 on the prototype X11 workstation, a warm sample observed the changed
pixel at 121 ms, the title generation at 165 ms, and 29 ms from Vite's hot-update
event to the renderer's second animation frame; 1,478 pixels changed in the
anti-aliased probe crop. This is a single observed sample, not a latency
guarantee.

The current driver is explicitly X11-first. With no `DISPLAY` it exits with a
diagnostic. On a Wayland session it exits unless `SWARM_ALLOW_XWAYLAND=1` is set,
because window enumeration and synthetic input then rely on compositor-specific
XWayland behavior. A later native Wayland driver can replace these scripts
without changing the application protocol or smoke scenario.

The desktop targets are manual local gates, not CI substitutes. CI exercises the
contracts and production bundle; a compositor-backed CI job is deferred until a
real second desktop environment justifies maintaining it.
