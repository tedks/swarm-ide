# Following registered agents while they work

Select an external session in the left rail. Its Worklog and the **Observed activity** instrument now refresh automatically while the app is visible and its local core is ready. The selected transcript is read roughly once per second; the explicit registry is refreshed roughly every three seconds. Reads are serialized, so a slow filesystem or core does not create a pile of overlapping requests.

These are observations of the registered local JSONL transcript, not generated logical summaries, verified repository changes, or a new launch. The existing recorded logical summaries remain separate in Recent Activity. Synthetic registrations are labelled synthetic. Only the operator-supplied registry is read; the IDE does not discover sessions by scanning an account.

The last bounded transcript remains visible during refresh. Each validated tail replaces the previous tail rather than accumulating events: entry IDs include offsets and are not stable identifiers across tail rotation. The core still limits detail to 120 eligible entries and 256KiB. The compact Activity instrument shows the latest four entries with attribution and an explicit link back to the full observed detail.

Hide the app to pause observation. On return it refreshes; on core recovery it discards prior-core authority and re-observes the retained selection. Failed reads retain the previous evidence with a notice and revoke its interactive handoff authority. Removing a registration clears its selected detail. Selection changes and late responses cannot publish another session's transcript under the current selection.

The bridge has no cancellation operation. A request already handed to the core may finish after hiding or disposal; its response is ignored and no further reads are scheduled until visible again. No handoff, launch, message or other control action is automatically retried.

Current visibility is document-level: a hidden app pauses, but collapsing an individual instrument while the app is still visible does not yet suppress its selected-session reads. That narrower consumer-visibility optimization is tracked separately; reads remain serialized and bounded.

## Verification

From the repository worktree:

    nix develop --command bazel test //tools/live-observers:unit --jobs=3
    nix develop --command bazel test //tools:quality --jobs=3
    SWARM_VIRTUAL_DISPLAY=:153 SWARM_VIRTUAL_DESKTOP_PORT=55233 nix develop --command bazel run //tools/live-observers:smoke --jobs=3

The smoke target creates its own virtual desktop and synthetic registry/transcripts, runs the production package and bridge, appends entries and changes the registry without pressing Refresh, crosses the bounded-tail threshold, and checks source/cursor/draft/camera/selection retention. It makes zero model requests. Read the generated proof and cleanup report together; synthetic transcript generation is not evidence of an actual model completing a turn.
