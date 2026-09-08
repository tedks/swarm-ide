# Trusted-local fleet cockpit

Open an agent draft from a source file, then use **Prepare trusted-local context** in the existing Agents dock. Review the exact core-materialized prompt and explicitly confirm normal Codex workspace permissions before launching. **New conversation** prepares another conversation from that fixed draft without selecting a different source or stopping an existing conversation.

The run strip selects a conversation's output, recent activity and controls. Each run has its own unsent message. A running turn offers **Steer current turn**; an idle live conversation offers **Send next turn**. Both include the observed turn expectation so a stale click cannot silently become a different kind of instruction. Approvals and **Stop conversation** target the selected core-issued run token. A pending operation on A does not disable B's controls, clear B's draft or select A when its reply arrives.

Task context lists conversations linked to the task at actual preparation/admission. **Open conversation** selects that exact run and opens the existing Agents tab; polling does not steal later user tab choices. The source editor, agent preparation draft, and graph instances/cameras remain mounted throughout. Agent turn completion is not task completion.

**Observe conversations** refreshes the run catalog. A lost acknowledgement is explicitly uncertain and is never replayed. After a core generation change, old commands and preparation confirmations lose authority; controls wait for fresh observation. A missing retained selection cannot prevent discovery of a newly running conversation. Archived histories have no send/approval/Stop or automatic-resume controls.

## Evidence and limits

The renderer consumes the strict shared trusted-local schemas. F1 owns concurrent execution and durable archived history; this renderer change does not itself establish a real multi-provider or multi-run service proof. Older one-run snapshots remain displayable.

The focused target `nix develop --command bazel test //tools/fleet-cockpit:unit --jobs=3` checks delayed responses, per-run drafts/pending commands, old generations, missing-selection recovery, explicit task opening and archive controls.

`nix develop --command bazel run //tools/fleet-cockpit:smoke --jobs=3` uses an owned disposable virtual X11 desktop. It exercises the actual packaged renderer/preload and real core file operations, but deliberately substitutes **synthetic trusted IPC**. It launches no provider or model. Its assertions cover delayed A acknowledgement while B is selected, exact B Stop leaving A active, archived read-only activity, and retained editor text/logical cursor/agent draft/graph DOM/cameras. The disposable repository does not contain build or task metadata; this is not evidence of populated service/build graphs.

The separate existing `//tools/trusted-local:smoke` uses the actual packaged trusted core with a deterministic protocol executable for one conversation. That is transport/lifecycle evidence, not a real model turn. Real fleet execution must be checked after integration with the reviewed F1 runtime.

Per-run unsent messages currently live in renderer memory, not durable storage. Long-session renderer retention and orphaned drafts are tracked as `fleet-renderer-retention-bounds-20260907`; do not advertise unlimited or refresh-persistent local drafts.
