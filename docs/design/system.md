# Swarm: an engineering organization in a box

Swarm is a local cockpit for understanding and directing software work. The
repository holds the code, designs, task metadata and instructions; the IDE puts
their relationships beside the agents and tools changing them. Navigate an
abstraction, inspect its context, apply intelligence, then follow the result.

## The component map

The accompanying authored graph lives in [the plan index](../../.swarm/plans.json).
These are responsibility areas that span renderer and core, not separate
executables or deployed services. The initial map shows only the six areas within
Swarm. Select an area to see its incoming and outgoing contracts; choose one
contract to read exactly what crosses that boundary and in which direction.

| Component | Responsibility | Connects to |
| --- | --- | --- |
| [Cockpit and source](cockpit.md) | Focus, navigation, editing and retained user work | Every projection and instrument |
| [Repository and context](repository.md) | Files, Bazel targets, service declarations and contextual facts | Cockpit, tasks, local core |
| [Plans and tasks](planning.md) | Design hierarchy, Ditz dependencies and task-bound agent context | Repository, agents, Work Log |
| [Agent ownership and steering](agents.md) | Native conversations, registered terminal sessions and parentage | Tasks, Activity, cockpit |
| [Activity and Work Log](activity.md) | What happened; what was accomplished | Agents, source, tasks and GitHub |
| [Runtime and providers](runtime.md) | Typed privileged operations and process lifetime | All renderer consumers |

Containment says **part of**, not **depends on**. Contract arrows distinguish
**request** (ask a capability), **result** (its reply), **data** (a consumed
observation) and **navigation** (move the operator's focus). Requests are teal,
results/data amber and navigation violet; the selector names the kind in text.
Older project indices without a kind remain generic contracts. Each component
shows only its own links, never every relationship among its children or peers.

For example, Repository → Runtime requests a query and Runtime → Repository
returns its result. These are directions of the same routed capability, not a
two-service dependency cycle. Agent execution splits into IDE-owned native runs
and observation/queued steering of an existing terminal owner. Activity → Agents
can mean navigation to the responsible conversation **or** delivery of the latest
saved Work Log summary to the rail; these are separate contracts. Activity →
Planning records an outcome note on an already-closed Ditz issue, never automatic
issue completion.

The product is one coordinated workspace, not one universal graph. The directory
tree, build dependency graph, service graph, plan hierarchy and agent lineage each
retain their own meaning and camera. Explicit links move focus between them;
opening a source file need not rearrange an unrelated service graph.

## Three kinds of truth

Working source may be ahead of the last build; deployment may be older again.
Derived views keep the last usable observation while work is in progress and
become current only for the inputs actually observed. A plan describes intended
structure; a build graph describes declared build relationships. Neither proves
that a particular agent completed a task.

The service projection reads actual Compose and `service.swarm.json` declarations
from the selected working tree. It never compiles a built-in example or starts a
container. Compose startup ordering, authored interface requirements, build
dependencies and running deployments remain distinct kinds of relationship.

Each Git worktree is a complete source world. A filename alone is insufficient
to identify another agent's edits. Observing a terminal-owned agent also does not
transfer ownership of its running process to the IDE.

## Implementation floor

[Root BUILD.bazel](../../BUILD.bazel) puts `app/**`, `core/**`, `protocol/**`,
tests, examples and `.swarm/**` into `//:quality_sources`.
`//:desktop-bundle` consumes that filegroup and `//:package.json`, using
`//tools:build-app` to produce the Electron archive. These shared build targets
are the current implementation floor; the component graph does not pretend
that TypeScript directories are independently deployable Bazel libraries.
Two areas listing the same source or build input does not add a component edge.
Actual Bazel rule/input relationships remain in the separate Build projection.

## Current increment

The merged baseline already edits real files, queries Bazel, reads Ditz, browses
plans, owns native agent conversations/forks, and observes and queues messages
to registered terminal sessions. Whole-fleet observation, cross-worktree
inspection and the online accomplishment Work Log are now implemented; their
boundaries are described in the component documents linked above. The plan
overview puts those components and their named connections beside the design
text, implementation mappings and task dependencies. A component's short
constraints are authored in the index alongside its links, not inferred from
the directory layout.

When a component changes, update its document, authored graph and build mapping
in the same change. Review the touched component's relationships, not the entire
architecture anew. See [runtime](runtime.md) for the actual execution boundary.
