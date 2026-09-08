# Living design browser: P7 implementation

## Outcome and scope

The System design tab opens repo-authored architecture in a graph and readable
document view. The top system has six components. Selecting one opens its design
and a lower graph naming actual Bazel targets and declared input relations.
Source, task and build gestures go through callbacks; ordinary document reading
does not replace the source editor or agent draft. A standalone DesignWorkspace
export lets the cockpit mount the same surface in the center pane.

## Decisions and boundaries

The existing version-1 plan forest accepts optional design metadata. Existing
indexes remain valid. Component relationships are authored, while the Build view
continues to own observed query results. Design labels are local canonical Bazel
labels, not invented TypeScript packages. The current implementation floor is
the shared quality_sources filegroup and desktop-bundle packaging rule.

Document text is read through file.read in the current registered repository.
Late navigation/core-generation replies cannot replace the selected document.
Markdown tables, headings, code spans and local links render as React text and
controls; HTML is not executed. External URLs are not navigated by this viewer.
Without a build callback, a target opens its declaring BUILD.bazel instead.

The system and six documents under docs/design describe actual baseline code.
F7 fleet observation, C7 cross-worktree inspection and K7 online Work Log are
explicitly prospective until integrated. Component changes and scoped reviewers
must keep the corresponding document/index/build mapping current in the same PR.

## Direct verification

Run `nix develop --command bazel test //tools/living-design:checks` for node and
renderer types, design-reference checks, stale-document/callback regressions,
and existing plan reader/UI tests. Run
`SWARM_VIRTUAL_DESKTOP_PORT=55334 nix develop --command bazel run //tools/living-design:smoke`
for a real packaged repository journey on an owned virtual desktop.

Initial direct checks: 70 tests and both typechecks passed; native scoped review
CLEAN. Initial packaged top → cockpit → real target graph → top passed with no
renderer errors and owned cleanup. Final readability delta uses a compact graph
layout and safe inline links/tables: 71 focused tests and both typechecks passed,
native delta CLEAN. Final actual packaged navigation passed in 812ms on owned
virtual display :184/port55334, with zero renderer errors and cleanup_complete=1.
Bazel query independently confirmed the mapped desktop srcs/tools and component
check/author data inputs. Final screenshots and concise evidence are in the P7
handoff; no full historical test sweep or live model turn was used.

## Remaining work

ROOT/C7 owns final main-pane placement, joined source/draft retention and app
adoption. This slice does not infer diagrams from arbitrary code or build docs
automatically; semantic maintenance is a scoped code-review responsibility.
