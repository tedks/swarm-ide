# Make the living system plan readable and navigable

This ExecPlan follows `.planning/PLANS.md` and is kept current as work proceeds.

## Purpose / Big Picture

Opening the IDE's plan should show the actual system design, its components and
their connections. Selecting a component should keep the document, breadcrumb
and graph together, with deliberate links to source, tasks and observed Bazel
targets. The file grid remains a different perspective, not an architecture map.

## Progress

- [x] (2026-09-08) Confirmed designated branch and inspected actual parser/UI.
- [ ] Publish bounded loading correction and actual-plan validation gate.
- [ ] Unify design selection/document/graph navigation and build activation seam.
- [ ] Run focused checks, native review and one owned virtual proof; push handoff.

## Surprises & Discoveries

The committed plan is valid JSON but its repository component has 20 source
paths while the protocol accepts only 16. `tests/living-design.test.tsx` parses
the file during collection, so the malformed plan prevents that suite collecting.
The standalone plan browser and system-design browser each load and select their
own index. Design build links currently guess BUILD.bazel if their callback is
not mounted; that is not evidence that a declaration exists there.

## Decision Log

Keep the existing 64 KiB total index and 128-node bounds. Increase only the
source mapping allowance, keeping docs separately bounded, and test the actual
committed index explicitly. Preserve every legitimate mapping. Export one plan
navigation controller so the cockpit can compose a practical layout without
separate selections or extra reads. Build navigation uses observed target
identity; absent observations are unavailable rather than guessed paths.

## Outcomes & Retrospective

Implementation is in progress. The first independently useful outcome is a
loadable actual plan; larger layout adoption belongs to the cockpit owner.

## Context and Orientation

`protocol/plans.ts` validates the authored design forest in `.swarm/plans.json`.
`core/plans.ts` reads that bounded canonical file. `app/renderer/plans/` contains
the React document, hierarchy and graph surfaces. `tools/living-design:checks`
typechecks and runs the focused plan tests. `docs/design/planning.md` documents
this component and its actual Bazel inputs. App.tsx and global layout are owned
by the parallel cockpit-layout worker and will not be edited here.

## Plan of Work

First add an explicit committed-index regression, separate source/document
counts, document the bound and publish a small commit/PR. Then consolidate plan
reading and selection into a controller shared by the design/outline surfaces.
Keep literal authored component connections visible, and let drill-down replace
only the selected component view. Publish a typed callback for observed build
targets to the cockpit worker and keep task/source callbacks deliberate.

## Concrete Steps

From this worktree run `nix develop --command pnpm install --frozen-lockfile`,
then `nix develop --command bazel test --jobs=3 //tools/living-design:checks
--test_output=errors`. Use the existing owned virtual `//tools/living-design:smoke`
with port 55414 and an unused owned display for one actual document/component
journey after implementation. Commit and push granular results on
feature/usability-plan-repair, open a draft PR, and publish concise seam notes
under /tmp/swarm-ide-usability.BirZCk/plans for the outer-layout owner.

## Validation and Acceptance

The committed plan must parse with all real source paths retained. A node above
the new finite source limit must still fail. Opening the plan must read the top
document; component/outline/breadcrumb selection must agree. Stale repository or
core results must not activate links. Build links never fabricate a source path.
Repositories without a plan should see useful instructions, not a demo fallback.

## Idempotence and Recovery

No source writes occur while browsing. Tests use disposable data and the GUI
proof owns its virtual desktop. Retain branches and shared app state; ROOT owns
normal merge and managed app adoption. Record remaining work in Ditz.

## Artifacts and Notes

Initial reported failure: `.swarm/plans.json` nodes[2].sourcePaths has 20 entries;
the protocol limit is 16. All new verification will be attributed to its code.

## Interfaces and Dependencies

Use the existing typed `plans.read` and `file.read` bridge, ProjectionCanvas and
already installed React dependencies. Plan containment and component connections
remain authored; observed build nodes stay a separate projection. No new provider
or window manager is part of this increment.
