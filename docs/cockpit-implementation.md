# Swarm operator cockpit

C7 implements the cockpit slice of `swarm-operator-hour.md`. The central view can inspect a registered agent's actual worktree without entering the editable source buffer store. The renderer sends only a session ID and relative filename through `worktree.inspect`; the local core resolves the registration's worktree and reads source plus its current Git diff. A worktree diff represents all current changes against HEAD, not authorship by one agent. An explicitly recorded event patch is shown separately as Recorded patch.

The source editor remains mounted while inspection is visible. Return to source restores the same buffer, not disk bytes. Requests are fenced when selection or local-core generation changes. This surface is read-only; normal local source editing and agent message controls are unchanged.

`WorkbenchSidebar` accepts a Work Log slot below agent runs. Raw activity stays in the persistent Activity area, while expanded entries belong in the center. F7 owns fleet observation; K7 owns Work Log production; P7 owns recursive component documents. C7 owns their application mounts and the shared theme. These peer mounts are pending reviewed producer commits, not claimed from placeholders.

Graph control icons and required React Flow attribution use explicit dark-theme foreground/background colors. Journal summaries show concise state, outcome, time and sources; generation details remain available under a collapsed provenance section.

Direct validation: `nix develop --command bazel test --jobs=3 //tools/operator-cockpit:checks`. The focused check covers registered-root reads, stale reply fencing, read-only source/diff rendering, local buffer retention and Work Log placement. Automated desktop verification uses the owned virtual-X11 harness on port 55332, never the physical display.
