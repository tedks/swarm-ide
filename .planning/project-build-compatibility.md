# Make external repository builds usable

This living plan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Opening Pure Sky must not build Swarm's FraudCheck example. A deliberate Refresh dependencies action should load the project's declared Bazel dependencies, show useful progress/errors, and allow cancellation. Automatic graph observation stays offline. Selected target compilation remains the separate explicit Build action from PR124.

## Progress

- [x] (2026-09-08) Confirmed PR124 merged and no owned work running; preserved its branch and evidence.
- [x] (2026-09-08) Implemented explicit topology applicability and opt-in query loading/cancellation in PR129.
- [x] (2026-09-08) Actual Pure Sky query completed in 7338ms, retaining 2000 targets/6385 edges; passive result reused, Git status unchanged, cleanup confirmed. Native convergence CLEAN after two race corrections.
- [x] (2026-09-08) Final corrected gate passed 63 tests/6 files and both types in 14.914s. Normal reviewed worktree-navigation join passed the same 63 plus 29 workspace-core tests and both types in 15.310s; native join CLEAN.
- [x] (2026-09-08) Ditz compatibility issue closed/synced with concrete outcomes; large-graph follow-up filed. Own Bazel server and real query owner cleaned. Final documentation/PR handoff prepared for ROOT landing; managed app untouched.

## Surprises & Discoveries

The observed Pure Sky failure is our download-disabled query flag in a fresh private output root: rules_python was missing. It is not evidence of broken Pure Sky definitions.

Native review caught cancellation during the last filesystem digest read and rejection of a second topology start stranding an admitted job. Abort fencing and admission ordering now have exact tests. An added mounted test initially used an unavailable assertion matcher; corrected to inspect the same native button disabled property. No product correction was inferred from that test setup failure.

## Decision Log

Use `.swarm/service-topology.json` to explicitly opt into the fixed example mapping, with exact known target and manifest validation. Never infer permission from a repository name. Reuse one private query directory within the provider lifetime, remove it after confirmed shutdown, and keep automatic queries download-disabled. Deliberate refresh may download; it does not compile targets. This is not persistent cache infrastructure.

## Outcomes & Retrospective

PR129 now makes the declared dependency query usable in actual Pure Sky without source edits or target compilation, while the legacy example requires an explicit declaration. The query retains a bounded target view; it does not establish complete project coverage, a successful Pure Sky compilation, or cross-restart cache persistence. Large-graph coverage follow-up is recorded as `swarm-build-graph-large-query-coverage`. No claim from PR124 is reused as evidence for this follow-up.

## Context and Orientation

`core/provider.ts` owns the legacy fixed service topology action. `core/build-graph.ts` samples build inputs and runs Bazel query through an owned process namespace; `protocol/build-graph.ts` validates its requests. `app/renderer/repository/use-build-graph.ts` polls only in-flight queries; `BuildGraphPane.tsx` supplies graph controls. The typed core retains authority over processes and filesystem access.

## Plan of Work

First gate the legacy action before fingerprinting, job creation or execution. Then extend the existing observation request with an optional cancel control, preserving repository/world validation. Explicit refresh passes download permission to the owned query; passive observation does not. Capture a bounded diagnostic tail and publish it during loading. Cancellation prevents publishing stale bytes and requires confirmed cleanup. Update runtime design and actual Bazel input mappings.

## Concrete Steps

Work only in `demo-build-jobs` on `fix/project-build-compatibility`. Run `nix develop --command bazel test --jobs=3 //tools/build-graph:compat-checks`, then `nix develop --command bazel run --jobs=3 //tools/build-graph:compat-probe -- /home/tedks/Projects/puresky/master`. The probe may load declared dependencies, never edit the project or build a guessed target.

## Validation and Acceptance

Tests must show undeclared workspaces never call the topology builder; Swarm's declared example remains applicable; automatic queries disable downloads; explicit refresh permits loading; cancel stops owned work without retry; useful Bazel errors reach the renderer. One real Pure Sky probe must show actual query outcome and cleanup, or the exact newly observed blocker. No full legacy suite is needed.

## Idempotence and Recovery

Do not repeat the established failed query unchanged. After a failed loading attempt, passive observations retain the error until deliberate retry or changed inputs. Retain scratch if cleanup is unconfirmed; never remove files a live owner may use. PR124 stays independently landed. ROOT owns final merge and app adoption.

## Artifacts and Notes

Current notes and final evidence live at `/tmp/swarm-ide-puresky-build.gD73ae/`. Original diagnosis is `/tmp/swarm-puresky-query-qzjx7k.log`.

## Interfaces and Dependencies

Extend `queryBuildGraph` with internal options for download permission, an owned cache directory and progress. Extend `BuildGraphProvider` with cancellation and per-lifetime cache cleanup. Keep pinned Bazel/JDK, request identity, byte/time bounds and namespace ownership. No global configuration changes or new dependency libraries.
