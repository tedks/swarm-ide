# Controlled task-run presentation proof

`nix develop --command bazel test //tools/task-runs:regressions --jobs=3`
runs the focused task association/component regressions.

`nix develop --command bazel run //tools/task-runs:smoke --jobs=3`
builds a test-only browser bundle containing the actual `TaskTrustedRuns`
component and CodeMirror. It uses the owned virtual-X11 harness (default `:155`,
port `55235`; override with `SWARM_VIRTUAL_DISPLAY` and
`SWARM_VIRTUAL_DESKTOP_PORT`). No inherited desktop is used.

The visible proof checks exact task/repository/world associations, rejection of
label-only associations, late selected-run observations, archived/retained
labels and deliberate exact-token callbacks. Real CodeMirror text, cursor and
DOM, an independent draft and a simple graph **stand-in** remain stable.
Screenshots and JSON evidence are retained under `artifacts/task-runs` or an
explicit `SWARM_ARTIFACT_DIR`; the harness reports owned cleanup separately.

This is **standalone controlled presentation evidence**. There is no production
App, bridge, core, real Ditz admission, provider/model execution or production
graph in this view. References are schema-checked controlled values, not proof
of materialization by the core. The proof installs no command transport and
rejects remote requests. Joining F1's validated producer and W6's conversation
selection remains a separate gate.
