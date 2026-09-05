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
shell. It finds the Electron window even when it is on another workspace,
activates it, uses `Ctrl-K`, types a fixture reset, captures the command palette,
clicks the reconciliation command, captures yellow and green, asserts the final
window title contains `FraudCheck visible`, and requires a material screenshot
change. Artifacts are written under ignored `artifacts/desktop/`.

The HMR probe makes a reversible one-degree hue edit to
`app/renderer/hmr-probe.css`, watches the actual desktop window title for the
next painted HMR generation, compares before/after screenshots, and restores the
file. On 2026-09-05 on the prototype X11 workstation, a warm sample measured 55
ms from the scripted edit to the observable window-title update and 19 ms from
Vite's hot-update event to the second animation frame; 11,663.4 screenshot
pixels changed. This is a single observed sample, not a latency guarantee.

The current driver is explicitly X11-first. With no `DISPLAY` it exits with a
diagnostic. On a Wayland session it exits unless `SWARM_ALLOW_XWAYLAND=1` is set,
because window enumeration and synthetic input then rely on compositor-specific
XWayland behavior. A later native Wayland driver can replace these scripts
without changing the application protocol or smoke scenario.
