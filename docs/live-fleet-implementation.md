# Registered live fleet

The existing external-agent adapter observes only explicitly registered Codex
sessions. Fleet snapshots now carry an additive `fleet` collection of bounded
session details, so consumers can follow every registered worker without
changing the selected conversation. `useExternalAgents().fleet` exposes it.

Each summary carries its operator-registered worktree and control mode. Worktree
identity is not inferred from a nearby command or the IDE's current repository.
Entry IDs identify the transcript inode and absolute byte position and remain
stable when the tail window advances. Actual tool arguments provide command,
working directory, file path and patch information when those are literals;
arbitrary tool code is never evaluated. A patch event records a tool request,
not a guarantee that the patch succeeded. User input, reasoning and raw tool
outputs are not included in this projection.

For `functions.exec`, only a whole sequence of top-level `await tools...` or
`text(await tools...)` statements with literal arguments is decoded. Declarations,
conditionals, functions and other unsupported expressions keep the entire
wrapper generic. This intentionally favors incomplete detail over attributing
an unexecuted branch to a worker. Fleet refresh follows the existing three-second
visible observer timer; selected conversation refresh remains one second.

Reading the fleet never selects tmux panes or sends messages. A selected detail
may expose copyable terminal commands only after its existing live target is
validated. Send continues through the supported `codex queue` route to that
same owner; no second process resumes the conversation.

The implementation is `protocol/external-agents.ts`, `core/external-agents*.ts`
and `app/renderer/external-agents/*`, built into `//:desktop-bundle`. The focused
live-fleet checks cover multi-session reads, tail identity, event extraction and
unchanged send/ownership boundaries. The shared system design links this
observer boundary separately from IDE-owned native execution.

## Direct verification

`nix develop --command bazel test --jobs=3 //tools/demo-agents:unit` checks both
TypeScript boundaries and the focused observer/parser/owner UI tests. The final
implementation passed 96 tests; the separate deliberate real-send test remains
disabled, because proof must not send unsolicited messages to working peers.

`//tools/demo-agents:fleet-smoke` is an explicitly invoked read-only production
package demonstration. Set `SWARM_FLEET_REGISTRY` to the operator's existing
private registry, `SWARM_ARTIFACT_DIR` to a fresh absolute evidence directory,
and `SWARM_VIRTUAL_DESKTOP_PORT` to an owned unused port. On 2026-09-08 it read
the actual ROOT and five children, showed 16 timestamped events without selection,
and exited cleanly with zero renderer errors. The initial driver setup omitted
its disposable repository's first commit; the core correctly refused that
workspace. Adding the committed HEAD repaired that test setup, not product code.

Native review found and rechecked two repairs: reject unsupported wrapper code
before extracting any nested call, and clear terminal commands when observation
authority is revoked. Both converged CLEAN. Foreign review seats were unfilled
under the user's Codex-only wave. No model turns were launched for this proof.

The display is a bounded recent window, not durable all-history indexing. Current
and completed registrations remain browsable; control mode states the registered
owner type, not a claim that a process is currently doing work. Cross-worktree
source activation and the separate accomplishment Work Log are cockpit/Work Log
consumer responsibilities. This observer does not infer task completion.
