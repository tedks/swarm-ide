# Explain hosted Linux prerequisite failures without weakening isolation

This living ExecPlan follows `.planning/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current.

## Purpose / Big Picture

CI currently reports a policy seed-pipe error before any agent starts, without explaining which Linux operation failed. Developers need a reproducible, bounded prerequisite diagnosis and the actual containment tests, not a misleading green check. This step adds an early, fail-closed check of the exact Linux namespace facilities used by our test tools. If a supported hosted environment cannot supply them without security changes, it will report that stopping boundary honestly.

## Progress

- [x] (2026-09-06 08:34Z) Created designated independent worktree from reviewed I3 6527495; claimed canonical Ditz issue and inspected exact failed hosted run34020316600.
- [x] (2026-09-06 08:35Z) Added fixed diagnostic command and focused tests; pushed8976956, opened draft PR33. Actual first hosted diagnostic failed with precise UID-map and loopback observations.
- [x] (2026-09-06 14:16Z) Resumed same child after quota restoration; targeted c8686b1 follow-up34038579174 confirmed enforced post-unshare profile and netlink EPERM. No image/security change attempted.
- [x] (2026-09-06 14:21Z) Consumed ROOT-reviewed T1c9e9a74/P5 by normal feature merge42ba0d. Native/Google review identified optional LSM metadata bug; fixed with regression. Pinned test Node and separated Node checks from Vitest discovery. Initial full build30targets passed; quality870 cases passed after discovery fix.
- [x] (2026-09-06 14:28Z) Frozen executable ba3f688/tree76b7f89 full30-target build and all11 uncached tests pass: quality870/63files plus12 focused checks; topology65.5s, journey5.5s, rehearsal27.8s, process3.2s and policy1.3s. No concurrent checkout edits during this gate.
- [x] (2026-09-06 14:28Z) OpenAI native and Google CLEAN convergence on c8686b1..ba3f688; Anthropic actual480s timeout124/noverdict recorded as missing. PR33 carries the review record. Only accounting changed after this tested executable. Final normal-merge/cleanup identity is recorded in the delivery handoff and Ditz, not presumed from this plan.

## Surprises & Discoveries

The original required process test discards subprocess stderr; the policy classifier keeps an allowlisted label but the actual hosted line is unrecognized. Neither symptom proves an AppArmor cause. Run34020316600 used Ubuntu24.04.4 image20260831.293.1, built successfully, then failed both prerequisites and skipped desktop tests.

The current hosted kernel6.17.0-1022-azure allows userns creation, then the child reports `unprivileged_userns (enforce)`. UID-map writes and private loopback RTM_NEWADDR are denied with EPERM. This matches Ubuntu's documented capability-denying default profile; correlated audit/host-policy A/B evidence was not acquired. The original historical seed-pipe error ordering remains unrecorded, not retrospectively proven by the new minimal bootstrap.

Full-suite verification found that naming a Node-native suite `preflight.test.mjs` caused Vitest to discover it as well; renamed to `preflight.checks.mjs`, retaining its explicit Bazel/Node target. Native and Google review caught an optional `/proc/self/attr/current` read becoming a false mandatory prerequisite on systems without that LSM attribute; the child now reports unavailable metadata without masking actual unshare failure. Real strace timeout testing proves both held tracee and grandchild stop.

Initial full-suite rehearsal hit STALE_CONTEXT after C2 created its own docs at14:19:27 during the scenario (failure14:19:37). This is an invalidated evidence run, not proof of a product regression. All subsequent whole-UI gates must run from a frozen committed checkout with no edits, not just no commits. The failed run's owned cleanup completed and artifacts are retained.

## Decision Log

Decision: keep the existing hosted image for the first diagnostic run and introduce no host-security changes. Rationale: changing images before observing the failure would replace diagnosis with a guess. Author C2, 2026-09-06.

Decision: use a new self-contained `tools/ci` Bazel package, preserving the policy and process packages byte-for-byte. Rationale: diagnostics are CI-specific, and independent containment assertions must not be weakened to match an environment. Author C2, 2026-09-06.

Decision: land a diagnostic stopping boundary, not an older-image security-baseline change. Rationale: Ubuntu documents the observed restriction, GitHub22.04 deprecation starts2026-09-17/retirement2027-04-17, and no supported environment-only repair within authority was demonstrated. An operator must review accommodation; required actual containment tests remain gates. Author C2, 2026-09-06.

## Outcomes & Retrospective

The delivered increment is an early stage-specific failure with current-run evidence and a documented operator boundary. The canonical hosted issue and blocked hosted-proof obligations stay open. No hosted-positive claim, new provider capability, host-security change or production model request has been made. Executable ba3f688 passed the complete frozen local build/test gate and available-seat review fixpoint. Hosted final-code run34038994909 still fails exactly at required Linux prerequisites; the conditional local waiver is not hosted acceptance. PR33 is the normal-merge delivery record; the ignored executive handoff records its final SHA and owned cleanup after landing.

## Context and Orientation

`.github/workflows/ci.yml` runs Nix, materializes JavaScript dependencies, builds and tests with Bazel, then runs owned virtual X11 checks. `tests/agent-owned-process.test.ts` requires a private Linux user/PID namespace using the pinned util-linux `unshare`. `tools/policy/boundary.mjs` uses pinned Bubblewrap with private user/PID/network namespaces and read-only filesystem mounts. A namespace is a kernel-managed separate view of processes, users or networking; these are prerequisite facilities, not proof of the whole agent policy. `tools/policy/runtime.nix` obtains the independent diagnostic runtime from the existing `flake.lock` and includes strace, which reports syscall results for a process we launch.

## Plan of Work

Add `tools/ci/preflight.mjs`, a zero-choice finite sequence of harmless commands, plus a no-user-arguments shell wrapper and Bazel run/test targets. Collect only fixed OS/kernel/control fields and bounded syscall/stderr output from our synthetic commands. Run user namespace creation, identity mapping, the exact owned-process prerequisite and a minimal Bubblewrap namespace bootstrap independently, then fail closed if any fails. No environment dump, credential reads, caller command interpolation, host writes, root execution or security toggles are allowed. Add an early workflow stage before expensive builds. Keep original proof targets mandatory, include all existing owned desktop topology/journey/rehearsal tests when prerequisites pass, and retain failure artifacts from the current run only.

## Concrete Steps

All commands run from `/home/tedks/Projects/swarm-ide/hosted-linux-prerequisites`.

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel test //tools/ci:preflight-test --jobs=3 --nocache_test_results --test_output=errors
    nix develop --command bazel run //tools/ci:linux-prerequisites --jobs=3
    nix develop --command bazel build //... --jobs=3
    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test //... --jobs=3 --nocache_test_results --test_output=errors

Create/push granular commits, draft PR and inspect at most two deliberately chosen hosted diagnostic environments/runs absent new exact evidence. Read official GitHub runner/Ubuntu documentation before changing the runner label. Native OpenAI plus foreign Google/Anthropic reviews use the installed council skill; unavailable seats are missing, not approvals.

## Validation and Acceptance

Focused tests must prove exact stage classification, output/time limits, clean child environment, argument rejection and fail-closed aggregation, using safe real executable boundaries where feasible. Locally the existing 29-target build and all ten uncached tests (716 baseline unit cases) must pass, plus new diagnostics tests. A preflight success only admits the existing mandatory policy and external-process proofs; it is not itself hosted acceptance. Hosted acceptance requires both actual proofs and all supported owned virtual UI targets to execute successfully. If administrator policy or a new runner product is required, keep the canonical issue open and document exact missing prerequisites rather than changing controls or skipping tests.

## Idempotence and Recovery

Diagnostics read fixed public system metadata and launch only finite owned synthetic processes; no global state is changed. Never signal processes by port/name or touch watched master/app. Keep evidence in the step directory and ignored master artifact path. Keep clean pushed feature worktree/branch and session for ROOT retirement. Existing user conditional remote-CI waiver allows local-evidence landing only after relevant checks and review, and never turns red hosted CI green.

## Artifacts and Notes

Raw original hosted log is `/tmp/swarm-ide-hosted-prereq-c2.5kQVTr/i3-merge-hosted.log`; publish only relevant sanitized extracts. Final authoritative handoff will be `master/artifacts/overnight-wave/hosted-prereq-c2/handoff.md`. File-based ROOT coordination is `/tmp/swarm-ide-hosted-prereq-c2.5kQVTr/seam.md`.

## Interfaces and Dependencies

No package, lockfile, flake, core, renderer, protocol, existing policy/process helper or shared-plan changes. New `//tools/ci:linux-prerequisites` accepts no caller arguments. New focused tests stay in the new package to avoid root source-tracking edits. All subprocess argv are fixed by the module; Nix executable locations are validated before execution, with no host executable fallback. All diagnostics describe observation rather than inferred security-policy authority.

Initial plan written2026-09-06 after original hosted-log inspection. Updated14:22Z with two deliberate diagnostic results, ROOT-cleared aggregate, review fixes, and invalidated initial rehearsal evidence. Updated14:28Z with the successful frozen full local gate, actual available-seat review fixpoint and explicit hosted stopping boundary; only accounting changed after tested ba3f688.
