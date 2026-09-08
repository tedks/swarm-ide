# Make the living system plan readable and navigable

This ExecPlan follows `.planning/PLANS.md` and is kept current as work proceeds.

## Purpose / Big Picture

Opening the IDE's plan should show the actual system design, its components and
their connections. Selecting a component should keep the document, breadcrumb
and graph together, with deliberate links to source, tasks and observed Bazel
targets. The file grid remains a different perspective, not an architecture map.

## Progress

- [x] (2026-09-08) Confirmed designated branch and inspected actual parser/UI.
- [x] (2026-09-08 13:40Z) Pushed actual-plan correction a82034d; 73 focused tests/types pass, native review clean.
- [x] (2026-09-08 13:55Z) Unified navigation/overview and observed-target resolver; focused tests pass. Native review's reconnect finding corrected with completed/pending regressions.
- [ ] Run focused checks, native review and one owned virtual proof; push handoff.

## Surprises & Discoveries

The committed plan is valid JSON but its repository component has 20 source
paths while the protocol accepts only 16. `tests/living-design.test.tsx` parses
the file during collection, so the malformed plan prevents that suite collecting.
The standalone plan browser and system-design browser each load and select their
own index. Design build links currently guess BUILD.bazel if their callback is
not mounted; that is not evidence that a declaration exists there.

## Decision Log

Keep the existing 64 KiB total index and 128-node bounds. On direct user feedback,
remove per-component source/document counts rather than repeatedly raising them;
collapse long lists in presentation while retaining every mapping. Test the actual
committed index explicitly. Export one plan
navigation controller so the cockpit can compose a practical layout without
separate selections or extra reads. Build navigation uses observed target
identity; absent observations are unavailable rather than guessed paths.

## Outcomes & Retrospective

The actual plan loads without arbitrary reference counts. A shared controller
keeps document, outline and breadcrumbs aligned. The overview has document,
component connections, build mappings and task dependencies; named edges and
constraints explain the system rather than the directory layout. Larger App
startup adoption belongs to the cockpit owner. Final package proof is underway.

## Context and Orientation

`protocol/plans.ts` validates the authored design forest in `.swarm/plans.json`.
`core/plans.ts` reads that bounded canonical file. `app/renderer/plans/` contains
the React document, hierarchy and graph surfaces. `tools/living-design:checks`
typechecks and runs the focused plan tests. `docs/design/planning.md` documents
this component and its actual Bazel inputs. App.tsx and global layout are owned
by the parallel cockpit-layout worker and will not be edited here.

## Plan of Work

First add an explicit committed-index regression, remove source/document
count caps, document the byte bound and publish a small commit/PR. Then consolidate plan
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

The committed plan must parse with all real source paths retained. Large lists
remain valid; the overall byte bound must still reject oversized files. Opening the plan must read the top
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

Update: direct user feedback replaced the initial count-increase proposal with
expandable presentation. Native review required a monotonic connection boundary
to prevent same-generation reconnects from reviving old read authority. The first
packaged test's final phrase was absent from the actual document; that assertion
now looks for an existing repository-design sentence, without weakening the
shared-selection, real-file or renderer-error checks.
