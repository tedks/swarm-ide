# Trusted-local Codex conversations

The IDE has a separate **Codex · trusted local** profile. It runs the operator's installed Codex with normal authentication, configuration, tools and approvals. It is not the old isolated read-only profile, and it does not claim that profile's policy verification has succeeded.

## Try it

Install Codex (tested with 0.153.4) in the PATH used to start Swarm. Optionally select an absolute executable with `SWARM_CODEX_BIN=/absolute/path/to/codex` in the IDE launch environment. This is privileged local configuration, not a renderer command or a copied account profile. Start the IDE through its documented Nix/Bazel development or evaluator launch path.

Open a repository source file, then choose **Prepare an agent draft**. Edit the instructions and, optionally, attach one repository task through the existing Tasks UI. In the dock's **Codex · trusted local** section, choose **Prepare trusted-local context**. The workspace and expandable exact prompt let you review the selected disk bytes and pinned task. Check the explicit permission confirmation and click **Launch trusted-local Codex**.

The conversation appears in that section. **Send next turn** continues the same thread; **Steer current turn** targets its current active turn. Command/file approvals show the proposed action, including execution directory for a command, and require **Allow once** or **Decline**. The IDE never accepts these automatically or offers session-wide approval escalation. A proposal without complete inspectable details cannot be allowed.

**Stop conversation** interrupts the current turn and closes the owned app-server and its descendants. It is available even after the conversation's command budget is exhausted. An acknowledgement is not model completion; the status distinguishes running, stopping, closed and failed. **Observe conversation** refreshes observation without sending a model turn. Slow or uncertain launch acknowledgements trigger read-only reconciliation, never automatic redispatch.

## Context and lifetime

Preparation captures the existing draft's fixed file, instructions and task reference. Navigation does not retarget it. The core materializes disk/task data and rechecks the same inputs before consuming the single-use launch token. Unsaved editor buffers are excluded; save and prepare again to include them. Normal Codex configuration and later filesystem edits are live, not frozen or represented as completely enumerated context. Repository content is context, not an additional permission grant.

The renderer remains sandboxed. Fixed typed requests go to the local core, which resolves the workspace and executable and launches without a shell or permission/configuration overrides. The existing private process-lifetime owner is used for cleanup, not as a filesystem isolation claim. Missing Linux ownership tools or Codex setup produces a concise unavailable condition.

The local core supports eight simultaneous trusted conversations (including owners whose cleanup is still uncertain), with one context preparation at a time and twenty retained records. Each run has an immutable token: targeted snapshots, Send, approval and Stop affect that token only. The compatible no-token snapshot still selects the latest run. The separate fleet cockpit is a consumer of this API; this core increment alone does not add a run selector to the existing dock.

Renderer refresh never launches another conversation. App/core shutdown stops all owned conversations. A separate private trusted-history store preserves bounded output, activity and the actual admitted task reference; it does not modify the old isolated-run history. History uses `XDG_STATE_HOME/swarm-ide/trusted-local/` (normally `~/.local/state/swarm-ide/trusted-local/`) with one writer per workspace, excluding a second IDE before it can read/archive a still-live owner's records. After restart, previously active records are explicitly interrupted/unknown and archived. Reading history never resumes a provider, sends a command or replays a turn. Closed history remains closed. Codex also retains its ordinary thread history.

Raw provider stderr is withheld. The service/history keeps up to a 128KiB UTF-8 output tail and the last one hundred activity entries; a per-record 256KiB serialized bound may omit additional older entries. Output truncation is labelled. The joined provider activity parser supplies correlated command/file/tool/turn observations through its bounded accessor and existing callback. Storage failures are visible and block new commands while preserving Stop authority. A failed session with unconfirmed cleanup continues occupying a live slot until the core restarts.

Interactive command/file approvals are supported. Other interactive provider requests, including currently unsupported user-question or MCP elicitation flows, are rejected visibly and the owned session closes without granting permissions. Existing configured tools/plugins remain enabled according to normal harness settings; their complete auxiliary interaction surface is not yet implemented here.

## Verification

Run `nix develop --command bazel test //:quality --jobs=3` for local service, session, protocol and mounted UI tests. Run `nix develop --command bazel run //tools/trusted-local:smoke --jobs=3` for the owned virtual packaged journey. That journey uses a **controlled deterministic harness**, not an actual model or real account, and proves context review, approval, next turn, Stop, source/camera retention and owned cleanup.

The optional manual live-smoke target is a separate, explicitly gated experiment; it must never be treated as part of unattended tests. Its results, if run, are recorded separately from deterministic UI evidence.

On 2026-09-07 the authorized one-turn probe used actual Codex 0.153.4 in an empty temporary workspace and returned “Swarm IDE launch verified.” Its one provider start ended with confirmed owned cleanup, no attached files, no model/configuration override and no approval answer. This establishes real launch/output/cleanup; it does not independently attest zero provider tool use or every configured plugin interaction.

The F1 manual fleet proof subsequently ran two actual Codex 0.153.4 conversations in an empty temporary Git repository. Each returned its own exact phrase. Stopping A preserved B's ready state and output; one follow-up reached B's same thread only. Exactly two provider starts and three model turns completed, both process owners confirmed cleanup, and reopening file-backed history retained both outputs with zero provider creations/replays. This was a core/service proof, not a joined fleet UI or task-bearing live-delivery proof. No tools were requested and no approval was answered; absence of read-only tool use was not independently attested.

`nix develop --command bazel test //tools/trusted-fleet:unit --jobs=3` exercises the bounded service/store/contract/session cases. The separate `//tools/trusted-fleet:live-smoke` target requires explicit three-turn authorization and a new private evidence directory; it is never part of automated test suites. Restart with interrupted providers is covered by controlled stored observations, while the real probe reopened already-cleanly-closed conversations.

The installed app-server help/schema and [official app-server documentation](https://learn.chatgpt.com/docs/app-server) informed the stdio conversation and approval integration. No credentials are read into IDE storage or test reports.
