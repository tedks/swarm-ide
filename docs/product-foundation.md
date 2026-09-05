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

On a wide screen, graph navigation, source/change observation, and contextual
instruments begin near a 30/30/40 split inside that cockpit. Those are tunable
defaults rather than fixed partitions. Opening source keeps the same graph
instances visible as its navigation column; selecting an edge makes its
direction, endpoints, interface contract, and provenance primary in the
instrument pane.

Lens tabs change which information is foregrounded without moving these
regions. `Ctrl-K` is the keyboard-first surface for navigation, commands, and
directing intelligence. Repo-local configuration will eventually add or refine
widgets by directory scope; the deepest applicable configuration supplies the
default while broader standard layouts remain selectable.

## Reconciliation

Green means a derived projection was computed from the exact working-source
fingerprint shown in the UI. Yellow means source changed and derived work is
needed or running. A yellow graph marker is an unlabeled action dot: when no
build is active, clicking it reconciles the topology. Red means a job failed.
Yellow and red retain the last green
topology; they annotate uncertainty instead of erasing useful knowledge or
presenting speculative output as truth. Gray is reserved for information that
has not yet been observed.

The real prototype opens the `swarm-ide` working tree gray and unobserved.
Dispatching “Build repository service topology” fingerprints the complete Git
working world, marks the repo and service projections yellow, and shows the
exact Bazel target while retaining any last green graph. A successful atomic
publication returns the views to green and adds `FraudCheck`, provided `Assess`,
and required `Payments.Authorize` from checked-in protobuf declarations,
implementation files, and one deterministic validated Bazel artifact.

## Foundation boundaries

The first real slice intentionally stops before provider discovery, repository-
wide inferred call graphs, terminals, Git mutation UI, agent harnesses, layout
configuration, deployment control, LSP, and merge tooling. Those should arrive
as narrow vertical slices behind the existing protocol. Fixtures remain test
material only; the normal application reports no runtime, deployment, metric,
or agent value unless a real provider supplied it.
