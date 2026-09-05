# Product foundation

`swarm-ide` is a steerable instrument panel over one software world. It lets a
developer move through distinct projections of that world—repository structure,
service calls, implementation plans, runtime behavior—without losing the thing
currently in focus or the work changing it.

## The cognitive model

The repository is ground truth. Build-derived documents, topology, binaries,
and metrics are published observations of an exact repository fingerprint.
Deployments identify the build they run. The UI always distinguishes these
working, built, and deployed revisions instead of blending them into a false
“latest.”

Graphs are bounded domain projections, not one universal ontology. A file and a
service remain different things in different graphs. Explicit navigation
mappings coordinate them: selecting `checkout.ts` can center Checkout in the
service graph, while the contextual instruments repopulate for the file.
Ambiguity remains visible when one artifact maps to several candidates.

The stable project workbench has four regions:

- work and agents on the left;
- one or more coordinated navigation graphs in the center;
- contextual instruments on the right;
- builds, resource use, diffs, and activity along the bottom.

Lens tabs change which information is foregrounded without moving these
regions. `Ctrl-K` is the keyboard-first surface for navigation, commands, and
directing intelligence. Repo-local configuration will eventually add or refine
widgets by directory scope; the deepest applicable configuration supplies the
default while broader standard layouts remain selectable.

## Reconciliation

Green means a derived projection was computed from the exact working-source
fingerprint shown in the UI. Yellow means source or work changed and derived
jobs are running. Red means a job failed. Yellow and red retain the last green
topology; they annotate uncertainty instead of erasing useful knowledge or
presenting speculative output as truth. Gray is reserved for information that
has not yet been observed.

The prototype's golden scenario begins at `work:a1`. Dispatching “Build and
reconcile current world” creates `work:b2`, marks the affected repo and service
paths yellow, shows the Bazel job and resource use, and retains the old service
graph. A successful atomic publication creates `build:b2`, returns every
derived view to green, and adds `FraudCheck` plus its `Assess` and `Authorize`
edges. This is deterministic mock data, not a claim that those services exist
in the repository yet.

## Foundation boundaries

The first implementation intentionally stops before real repository parsing,
Bazel query extraction, terminals, Git mutation, agent harnesses, layout
configuration, or deployment control. Those should arrive as narrow vertical
slices behind the existing protocol. The current UI is evidence for the
interaction model and for the consumer boundary, not a general plugin framework.
