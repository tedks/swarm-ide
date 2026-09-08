# Swarm operator cockpit

C7 implements the cockpit slice of `swarm-operator-hour.md`. The central view can inspect a registered agent's actual worktree without entering the editable source buffer store. The renderer sends only a session ID and relative filename through `worktree.inspect`; the local core resolves the registration's worktree and reads source plus its current Git diff. A worktree diff represents all current changes against HEAD, not authorship by one agent. An explicitly recorded event patch is shown separately as Recorded patch.

The source editor remains mounted while inspection is visible. Return to source restores the same buffer, not disk bytes. Requests are fenced when selection or local-core generation changes. This surface is read-only; normal local source editing and agent message controls are unchanged.

`WorkbenchSidebar` mounts K7's Work Log below agent runs; reading does not automatically start its summarizer. Raw activity stays in the persistent Activity area, while `FleetActivityView` displays the fleet's timestamped entries in the center Activity log. Each event retains its containing session identity when opening source or a recorded patch. Live activity and saved summaries are separate tabs. System design opens P7's document/component/Bazel view in the center. F7 owns fleet observation; K7 owns Work Log production; P7 owns recursive component documents. C7 owns their application mounts and the shared theme. These joins consume ROOT-reviewed committed producers; proof of model-generated outcomes remains attributed to K7's separate real run, not to C7's UI test.

Graph control icons and required React Flow attribution use explicit dark-theme foreground/background colors. Journal summaries show concise state, outcome, time and sources; generation details remain available under a collapsed provenance section.

Direct validation: `nix develop --command bazel test --jobs=3 //tools/operator-cockpit:checks`. The focused check covers registered-root reads, stale reply fencing, read-only source/diff rendering, local buffer retention and Work Log placement. Automated desktop verification uses the owned virtual-X11 harness on port 55332, never the physical display.

Native review found and corrected two concrete cases: Ctrl+W now closes inspection rather than the hidden source tab, and malformed event paths produce an actionable notice rather than escaping a React effect. Mounted tests preserve the actual CodeMirror document, logical cursor, graph instances and file-watch lifetime. `//tools/operator-cockpit:regressions` runs these direct tests separately from both TypeScript checks.

Work Log outcomes open K7's pure `WorkLogEntryDetail` in the center. Changed areas,
checks and follow-ups stay attached to their agent/task; opening the detail does
not add polling, start a model or mutate Ditz. Closing it or opening System design
preserves the local source buffer. The native pass also corrected simultaneous
design/worktree visibility and a misleading empty-diff message after a failed
read; recorded patches remain accessible when current source is unavailable.

The focused suite contains 30 tests with both node/renderer typechecks. The
packaged operator harness uses an owned X11 session and real registered C7
transcript/worktree, with a separate dirty local repository containing a same-path
decoy. It also reads an archived K7-generated outcome and copied `docs/design/`
documents through the normal core; those are captured inputs, not new inference.
Run it through `//tools/operator-cockpit:smoke` with an explicit private registry,
session ID and `SWARM_COCKPIT_WORK_LOG_ARCHIVE`. No observed agent is messaged.

Current limit: the external-agent briefing still hides configured context links
when its worktree differs from the opened repository. The actual Activity event
path is connected and reads the correct registered worktree. Unsupported tool
wrappers remain generic activity rather than guessed file attribution.
