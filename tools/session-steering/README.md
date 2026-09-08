# Controlled session-steering proof

Run `nix develop --command bazel run --jobs=3 //tools/session-steering:smoke`.
The owned virtual display defaults to `:154` and its readiness port to `55234`.

This runs the production desktop archive, production bridge, and real local-core
argv execution. It registers two **synthetic, owned** file-holding tmux processes
with `evidence: local` solely to exercise the local-session send gate. Their
labels and recorded conversation explicitly disclose the controlled fixture.
`SWARM_CODEX_BIN` points to an owned executable fixture, not an account-backed
Codex CLI. The fixture records arguments and emits a fixed queue acknowledgement.
There are zero model turns; this proves queue receipt handling, not consumption,
actual Codex queue compatibility, or model execution.

The proof uses a native explicit Send activation, checks shell metacharacters
remain one literal message argument, rejects stale observation identity and an
owned closed pane without a second fixture execution, retains dirty source and
graph cameras, and verifies the surviving observed process outlives app close.
Only the private tmux socket created by this proof is cleaned up. JSON evidence
and screenshots are retained under `artifacts/session-steering/run.*`.
