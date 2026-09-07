# Task context: preserve intent while the world changes

This is a **repo-authored briefing**, written by an AI implementation agent as
repository documentation. It explains intended guidance, not a reconstructed
event summary, raw agent transcript or automatic provider instruction. It
accompanies the task-context component and connects its linked information.

## The product question

How can an operator give a small implementation agent the right task without
losing the source they were working on—or quietly changing the assignment while
browsing? The answer here is a fixed-source draft, one explicit repository-task
attachment, and a reviewable preparation step.

Separate **your instructions**, **the task's recorded intent**, and **the source
bytes being discussed**. Clicking a graph is navigation; accepting an attachment
changes the assignment; preparing reads local data; executing would require a
separate verified gate.

## The small organization behind the feature

These component links name actual Ditz records, not agent session identities:

| Record | Responsibility |
| --- | --- |
| `repo-task-draft-contract-d2` | Decide explicit attachment and fixed-source semantics. |
| `repo-task-draft-base-d3` | Share the format and preserve stored histories. |
| `repo-task-context-core-d4` | Materialize and revalidate pinned Git/YAML context. |
| `repo-task-draft-ui-d5` | Make attachment, replacement and cancellation deliberate. |
| `repo-task-draft-integration-d6` | Verify metadata advancement, retained context and recovery. |

Inspect them in **Tasks → All**, or use
`nix develop --command ditz show <id> --json`. Some descriptions are empty and
these records have no file references. The Plan index supplies authored source
associations; it does not invent historical metadata or dependency edges.

## Why these sources?

[The design](../repo-task-draft.md) states the decisions and compatibility
constraints. Its opening D3-only status is historical: merged D4 implements real
task-bearing Prepare, while managed launch remains gated.
[The shared contract](../../protocol/agent-task.ts) defines the bounded reference.
[The core resolver](../../core/tasks/draft-context.ts) materializes it.
[The attachment surface](../../app/renderer/tasks/TaskDetail.tsx) proposes the task.

This is context-guided work: broad design explains intent, a contract narrows the
obligation, a task names implementation, and lessons constrain the next move.
Linking the artifacts makes guidance inspectable. **It does not automatically
attach every linked file to a model.** Review the exact prepared prompt rather
than treating a useful briefing as a complete instruction or permission inventory.

## Lessons visible in the interaction

Navigation must not steal later intent. A stale attachment proposal must not
change a newer draft. Source buffers, logical cursor and independent graph
cameras should survive inspecting another artifact.

A newer metadata commit is a new observation, even if the issue title looks
unchanged. Explicitly refresh, reattach and prepare. Preparation reads disk;
unsaved editor text is not silently substituted. Old stored context stays
historical and readable across format changes.

Preparation is real local behavior. Admitted task histories in the automated
rehearsal are **deterministic synthetic execution**, not provider work. Managed
launch remains unavailable until effective policy is verified.

## Close the loop

**Recent activity → Logical changes** contains recorded supervised summaries of
these milestones with evidence and caveats. Opening it does not rerun checks or
turn D4/D5/D6 into session identities. An operator with an external registry can
separately inspect a known session's worklog; the missing automatic join is
explicit.
