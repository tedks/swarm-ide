# Packaged Activity usability proof

Run `nix develop --command bazel run //tools/activity-usability:smoke`.
The existing supervisor owns a disposable Xvfb/Openbox display (default `:164`),
port `55413`, application profile, and process sessions. It refuses occupied
display/port allocations and cleans up only its owned children and scratch data.

The unchanged packaged Electron renderer/preload/core observes an ordinary
scratch Git README and two explicit private JSONL registrations labelled
`Proof fixture 1` and `Proof fixture 2`. Their command/edit records are controlled
test inputs, not executed operations, live agents, or model responses. They have
no tmux authority; no model messages are present or sent.

The bounded keyboard/pointer journey verifies one Activity heading, no redundant
inner Activity/Live heading, raw command/edit events with exact timestamps,
keyboard opening/closing of the Summary settings gear, and retention of dirty
README text/cursor, an unsubmitted agent draft, and graph camera transforms.
It rejects source writes and control actions, including `workLog.start`; the
existing single startup reconciliation is recorded separately. It makes no
lifecycle-glyph claim. Renderer DOM/editor inspections are read-only, and the IPC
observer forwards production requests unchanged.

Each run writes `proof.json`, screenshots (including the full dock), and owned
supervisor/cleanup evidence beneath `artifacts/activity-usability/run.*`.
Interactions must complete within 15 seconds after the initial registered
activity appears; startup and the outer supervisor have separate finite bounds.

`nix develop --command bazel run //tools/activity-usability:central-refresh`
adds a central Activity check using the same owned fixture, package and bounds.
It appends two explicitly controlled transcript records, watches the existing
observer publish the first without clicking, and uses the actual central Refresh
for the second. It checks the chosen reader, overview/event reopening, draft
focus, retained source/cameras and zero renderer errors. No recorded command is
executed, and the bridge is not replaced. Screenshots 03/04 show the central list.
