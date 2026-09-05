# Development and visual verification

Enter every supported path through Nix and Bazel from the feature worktree:

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel build //...
    nix develop --command bazel test //...
    nix develop --command bazel run //:dev

The development target is the interactive loop. Visual verification is
self-contained and does not drive that window:

    nix develop --command bazel run //tools:desktop-smoke
    nix develop --command bazel run //tools:desktop-zoom-smoke
    nix develop --command bazel run //tools:measure-hmr
    nix develop --command bazel run //tools:desktop-reload-smoke

The interactive loop uses `SWARM_DEV_PORT`, defaulting to `5173`. Set it on the
long-running process when that port is occupied. Automated scenarios use the
separate `SWARM_VIRTUAL_DESKTOP_PORT`, defaulting to `55174`, because each
scenario launches and owns its own app:

    SWARM_DEV_PORT=55173 nix develop --command bazel run //:dev
    SWARM_VIRTUAL_DESKTOP_PORT=55174 nix develop --command bazel run //tools:desktop-smoke

The value is accepted only as decimal digits in the TCP-port range `1..65535`.
An empty, malformed, out-of-range, or already-bound value stops with a clear
error. The launcher resolves the endpoint once for Vite and Electron; the smoke
and HMR commands then select the window running that exact renderer URL instead
of whichever Swarm IDE window happens to appear first.

The supervisor creates a mode-0700 runtime directory, a private Xauthority
cookie, an atomic nonzero-display lock, an Xvfb server, and one Openbox desktop.
It starts Xvfb, the window manager, the app, and the scenario in separate POSIX
process sessions and records PID start times. Every GUI command receives the
owned `DISPLAY` and `XAUTHORITY` explicitly. Cleanup signals only members of
those recorded sessions, checks for PID reuse, removes only its token-matched
display lock, and is bounded and idempotent.

The shared driver accepts one window only when its title shape, exact inert
renderer marker, X11 PID, and launched app session all agree. It rejects zero,
missing, mismatched, dead, ambiguous, or recycled identities before every
activation, input, geometry query, wait, or screenshot. Wrong-title and
same-title/wrong-process windows cannot win by ordering. Screenshots read only
that accepted virtual window resource and never the virtual root or the
developer desktop. Local artifacts are written under ignored
`artifacts/<scenario>/<run>/`; a Bazel test writes the same evidence through
`TEST_UNDECLARED_OUTPUTS_DIR`.

The HMR probe makes a supervisor-restored hue edit to
`app/renderer/hmr-probe.css`, polls
a dedicated 48×48 screen region inside the selected Electron window, watches for
an exact HMR generation increment in the title, and restores the file. On
2026-09-05 on the prototype X11 workstation, a warm sample observed the changed
pixel at 130 ms, the title generation at 176 ms, and 25 ms from Vite's hot-update
event to the renderer's second animation frame; 1,478 pixels changed in the
anti-aliased probe crop. This is a single observed sample, not a latency
guarantee.

The current driver is intentionally virtual-X11-first. It refuses display zero
or any display not backed by its private ownership record and live Xvfb PID;
Wayland versus X11 on the host is irrelevant. CI runs the topology/source smoke
as `//tools:virtual-desktop-smoke-test` without a logged-in desktop and uploads
its unpacked undeclared-output evidence even on failure.

## Selective development updates

Preserve everything an edit did not invalidate. Repository/service source edits
update observed data; they do not reload the IDE. Renderer edits use React/Vite
HMR. Comment-only or source-map-only bundle changes require no lifecycle action.
One successful multi-entry esbuild transaction compares executable output and
publishes cumulative core/preload revisions, so rapid shared-input edits cannot
hide an earlier required update. Failed builds retain last-good executable code.

Core edits replace only the utility process. The window, document and editors
stay alive; generation-tagged transport rejects old replies/events. Read requests
settle during recovery, source observation is registered again, and the previous
topology stays visibly stale until a real build reconciles it. Operational focus
references move to the current working revision; historical derivation
provenance does not. Recovery waits up to 15 seconds for readiness and allows
three retries (100/500/1500ms), replenished after 30 seconds of stability. An
exhausted recovery remains visible; it does not loop indefinitely.

Preload edits refresh the existing webContents only after buffers are safe.
Dirty/conflicted buffers, uncertain saves and actual in-flight writes block that
refresh, including Ctrl-R. A save interrupted around commit is never replayed:
after its original operation settles, **Check disk** confirms the buffer was
saved, makes a retry available if disk still has the base, or reports a conflict
without overwriting local text. An intentional core update drains writes instead
of timing them out; a hung write therefore visibly defers that update until it
settles or the core exits. Renderer HMR checkpoints preserve dirty buffers and
pending-write ownership even when a hook change remounts the component.

A permitted document refresh restores open paths, active surface/lens, focus,
interface zoom and the last observed topology. Focus restoration waits for the
new generation's actual snapshot. If session storage cannot hold the checkpoint,
automatic refresh defers with a diagnostic; it does not discard state or enter
a reload loop. These checkpoints are not crash-proof backups of dirty buffers:
forced process termination, an OS crash, or a broken renderer that never runs its
guards can still lose unsaved work. Graph viewport transforms, editor undo history
and cursor position are not yet checkpointed across a necessary document refresh.

Electron-main edits require a deliberate restart and leave the current native
window intact. Installing this supervisor into an already-running older launcher
also needs a one-time deliberate adoption: do not fast-forward its watched source
until that old launcher has been stopped or explicitly paused, since the old code
still recreates the window on any bundle rebuild.

The reload scenario uses a disposable Git world and the same owned Xvfb/Openbox
harness. It exercises real renderer and core edits, structural React remounts,
comment-only/failed builds, core crashes, dirty preload deferral, rapid changes,
combined core/preload refresh and main restart deferral. It asserts native X11 ID,
Electron main PID, workspace and focus while another virtual window owns focus.
The scenario materializes frozen dependencies in the copy, never mutates the
developer's source, and shuts down that copy's Bazel server at teardown.

Local Electron runs retain Chromium's operating-system process sandbox. Hosted
CI sets `SWARM_ELECTRON_NO_SANDBOX=1` only because the immutable Nix store
cannot install Electron's helper as a root-owned setuid binary. Chromium's OS
sandbox is therefore disabled in that CI process, while the renderer's API
restrictions and context-isolation boundary remain configured. The launcher
rejects every other value so an accidental local setting fails closed.
