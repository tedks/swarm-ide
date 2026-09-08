# Plans and task blockage

Choose **Plan** in the top bar. It contains two separate projections: **Task blockage** and **Plans & components**. System, Service and Build remain separate views; changing the lens keeps their mounted cameras and the source editor/agent draft.

## Task blockage

Choose **Load dependency graph** to read details from the current local Ditz metadata revision. An arrow goes from the blocker to the blocked task. Selecting a node only inspects the graph; **Open task details** deliberately opens that revision in the existing task information pane. From there, use **Show task document**, **Reveal working file** or **Attach this task to draft**. Attachment keeps its existing requirement for a separately chosen working source; a task link does not select a source or launch an agent.

The view reads every available task detail, with four concurrent requests. Open tasks come before closed tasks, then IDs sort deterministically. All recorded edges, isolated tasks and missing endpoints remain in the graph; there is no graph count cutoff. Coverage distinguishes loaded detail, unavailable reads and pending work. Missing, cyclic and asymmetric declarations are shown literally. No known blockers is **not** dispatch authorization. Refreshing metadata does not silently substitute a new task revision beneath an old graph: explicitly load again. A changed core lifetime makes retained information non-current. See [Task workspace](task-workspace.md) for scope and cancellation behavior.

Graph nodes, controls, a keyboard outline and an edge list give complementary ways to navigate. The graph can pan/zoom; Fit is an explicit camera action. Metadata is read only: there is no scheduler, task writer or automatic dependency repair.

## Authored plans

Choose **Load plan index** to read `.swarm/plans.json` through the privileged contained-file broker. The displayed SHA-256 identifies the exact working index bytes at its read time, not a deployment, Git commit, or the contents of every linked file. Reload explicitly after edits. Missing, malformed, oversized or unsafe files produce unavailable information, never a demo fallback.

The checked-in Swarm index is a small **authored** map of this implementation and its design intent. It is not automatically inferred and does not claim full architectural coverage. Parent links express containment, not task blockage. Select a node to read its documents as ordinary source text, open explicit source paths or inspect an explicitly linked task at the current task snapshot revision. A missing task association remains unavailable. “Why this context?” lists deliberately authored doctrine, contract and lesson references; it is not an inventory of effective agent permissions or proof that a run consumed them.

The use of composable, inspectable briefing references is informed by the `orgs` engineering-organization skill work. This UI does not claim to execute that skill system or establish causal productivity gains. No private orgs artifacts or conversations are included.

## Maintaining the index, for humans and agents

Edit `.swarm/plans.json` as a normal reviewed repository artifact. Keep stable IDs when renaming titles; update explicit document/source/task links with the implementation. Do not infer parenthood from file paths or use procedural skills as product component nodes. The format is strict version 1:

```json
{
  "version": 1,
  "nodes": [
    {
      "id": "plan:product",
      "kind": "plan",
      "title": "Product intent",
      "parentId": null,
      "docs": ["docs/design.md"],
      "sourcePaths": [],
      "taskIds": ["product-design"],
      "contextRefs": [
        { "kind": "doctrine", "path": "AGENTS.md", "note": "Shared working norms" }
      ]
    },
    {
      "id": "component:engine",
      "kind": "component",
      "title": "Engine",
      "parentId": "plan:product",
      "docs": [],
      "sourcePaths": ["src/engine.ts"],
      "taskIds": [],
      "contextRefs": []
    }
  ]
}
```

Every field is required; empty arrays and nullable parent/note are explicit. Unknown fields, duplicate IDs, missing parents and cycles are rejected. IDs contain ASCII letters, digits, `_`, `-`, with optional colon-separated segments. Node kinds are `plan` or `component`; context kinds are `doctrine`, `contract` or `lesson`. Paths are literal canonical repository-relative candidates; actual opening still checks containment and regular-file identity. A link never grants access outside the registered repository.

Limits: 64 KiB index bytes, 128 nodes, 128-byte IDs, 256-byte titles, 16 document paths, 16 source paths, 32 task IDs and 16 context references per node; paths are at most 1024 UTF-8 bytes and notes 512. A finite forest permits multiple independent roots and arbitrary hierarchy depth up to the node bound. Do not split oversized data silently or treat missing information as an empty complete model.

## Local proof

Use the Nix shell and Bazel targets documented in the repository. `//tools/demo-plans:packaged-plans-test` owns a disposable virtual desktop and a real local Git/Ditz demonstration repository. The CLI-authored positive data is test input, not a production fixture provider; malformed metadata cases are explicit faults. It exercises actual packaged main/preload/core and ordinary UI navigation, source/draft retention and no provider launch. Full release instructions are maintained separately in the public demo documentation.

The proof also authors 65 extra tasks to exercise visible partial coverage rather than only testing the cap in isolation. A separate `SWARM_PLANS_CASE=swarm` run archives the committed Swarm source/index and creates disposable matching task records; it does not copy the original repository's Ditz branch. Exact renderer diagnostics are retained in the evidence. The previously accepted `ResizeObserver loop completed with undelivered notifications.` warning remains a tracked noncritical limitation; every other renderer error still fails the proof.
