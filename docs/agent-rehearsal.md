# Explore the agent cockpit at human pace

This **test-only rehearsal** uses the actual cockpit, preload bridge, current
disk context, durable run service and private history store. A bounded local
deterministic responder stands in for the model. Production launch is still
`ADAPTER_POLICY_UNAVAILABLE`. There are no credentials, model requests, external
agent processes, tools or agent-authored source changes.

## Deliberately open your own window

From the checkout containing this target (not the stale watched master):

    cd /home/tedks/Projects/swarm-ide/agent-rehearsal
    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel run //tools:agent-rehearsal --jobs=3 -- --interactive-desktop --workspace /home/tedks/Projects/swarm-ide/agent-rehearsal

Run this yourself in your selected X11 desktop environment. The command opens
a **new, separate native window**, not the watched development app. It requires
both `--interactive-desktop` and an absolute `--workspace`; without them it
opens nothing. `--help` explains the choice. This prototype's registered world
is the checkout-world example, so choose an existing Git checkout containing
`examples/checkout-world/services/fraudcheck/fraudcheck.ts`, not an arbitrary
unrelated project. The canonical workspace path is printed and displayed.

The Bazel target compiles a separate artifact and reuses it while source inputs
are unchanged. Human mode loads that built renderer from disk and needs **no
development port**. It does not restart, update or adopt master. This is a
compiled manual rehearsal, not a new hot-reloading development framework.

## Try the actual controls

Use Ctrl+K, **Open FraudCheck implementation**, then **Ask an agent about this
focus**. Enter a short task, choose **Prepare disk context**, inspect the exact
disk context and check its confirmation, then **Launch read-only run**. The
attached file is the disk version, not an unsaved editor buffer. Navigation can
move while the draft stays attached to its original focus.

Output arrives for about20 seconds, visibly labeled synthetic. The responder
prints a bounded literal task preview and repeated multibyte/HTML-shaped sample
text; it neither understands nor executes it. Requested model fields cannot
turn this into inference. The observed model is `REHEARSAL-NO-MODEL`.

**Send to this run** receives a deterministic acknowledgment after roughly700ms.
Starting instruction text with the literal prefix `[delay]` delays it to1500ms;
pressing **Stop** meanwhile demonstrates a genuine service-held delivery-unknown
receipt. Stop's acknowledgment is followed separately by an interrupted terminal
turn and confirmed in-process disposal. Neither the click nor its acknowledgment
is cleanup evidence. A naturally finishing run has over one256KiB transcript
page; use **Read transcript from start**, then **Read next transcript page**.
Select history without retargeting source; **Reveal launch focus** is deliberate.

The persistent banner states **REHEARSAL — deterministic output — no model or
external agent process** on every load. Source and both graph panes remain the
normal cockpit. The service graph is initially honestly unobserved; the ordinary
Build action can run the actual registered Bazel build. **Normal explicit editor
Save writes real source.** Only the synthetic responder has no writing capability.

## Reload, close and private history

Every invocation creates and prints a fresh owner-private directory beneath
`~/.local/state/swarm-ide-rehearsals/session-*`. It holds Electron state and the
real per-workspace agent store. The same live core/store survives a clean
renderer reload; reload never replays launches, steering or Stop. Unsaved source,
drafts and unresolved local instructions retain the production reload/close
vetoes. Save/reconcile your source or explicitly clear local intent through its
ordinary UI before refreshing. **Discard local agent intent and allow refresh**
acknowledges loss of local text/receipts; it does not establish delivery or erase
the durable unknown instruction. Never force-close simply to reset a demo.

Ordinary accepted window close drains the actual core shutdown handshake through
a bounded test-only wrapper, disposes responder timers and closes the private
store. Closing an active run can leave its outcome unknown; disposal is separate.
A crash likewise preserves conservative unknown/delivery-unknown/cleanup-unknown
state and does not unlock replay. There is no resume/profile-picker feature in
this slice: a new invocation creates a new session, while the old files remain
available for deliberate local inspection.

Human history is **not automatically deleted or exported** on close, including
entered instructions and captured context. Treat the printed directory as
sensitive local data. Limits are20 retained runs, one active run,16KiB task or
instruction,128KiB explicit context,350KiB synthetic output per run and64MiB
total store. Quota refuses more work rather than silently evicting history.
Each invocation has its own quota; retained session directories accumulate until
the operator deliberately removes an exact unwanted session.

## Automated evidence stays off the physical desktop

Serialize with all other GUI/full-suite users:

    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock env SWARM_VIRTUAL_DESKTOP_PORT=55174 nix develop --command bazel test //tools:virtual-desktop-agent-rehearsal-test --jobs=3 --nocache_test_results --test_output=errors

For inspectable owned virtual evidence, use `//tools:desktop-agent-rehearsal-smoke`
with `bazel run` under the same lock; optional `SWARM_ARTIFACT_DIR` selects an
absolute evidence parent directory; every invocation creates a fresh run subdirectory
so old success/failure cannot settle a new proof. Both modes use the compiled
file renderer; the virtual wrapper alone starts a loopback artifact-readiness
listener for the existing harness protocol. No automatic check uses inherited physical DISPLAY.
The harness creates its own Xvfb/Openbox window and synthetic private profile;
only those synthetic test resources are auto-cleaned. Its fixed ordinary-UI
driver performs no private fixture settlement or hidden state mutation.

Evidence includes actual request counts, durable snapshots, real graph pans,
source buffer reload veto, paged history, explicit local-loss acknowledgment,
zero replay, active-window close and shutdown diagnostics. This proves only
in-process responder disposal. I2's external namespace fixture and the unfinished
installed-provider policy/credentialed acceptance remain separate proofs.
