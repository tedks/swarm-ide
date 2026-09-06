# Hosted Linux prerequisites: an honest CI boundary

Swarm IDE's CI requires unprivileged Linux namespaces, not merely a Linux runner label. The local Nix runtime pins userspace tools but cannot pin or override the hosted kernel's security policy. A successful preflight admits the real tests; it never establishes production agent availability.

## What CI checks

Run from a materialized checkout:

    nix develop --command bazel run //tools/ci:linux-prerequisites --jobs=3

The command accepts no arguments. It obtains the existing lock-pinned policy runtime and runs four fixed probes as a non-root user: user-namespace creation (including optional security-profile metadata), current-user UID mapping, the exact external-process proof prerequisite, and a minimal Bubblewrap private-namespace bootstrap that executes only `true`. It reports a single JSON record with bounded syscall observations and fixed public OS/kernel/control fields. Each probe has a three-second deadline and a 16 KiB output-buffer bound; the tracer kills its tracees if it exits. Dependency acquisition has a separate 120-second bound. It neither reads credentials nor launches Codex.

`PREREQUISITES_PASSED` requires every probe to succeed. `LINUX_PREREQUISITE_UNAVAILABLE` fails the workflow before expensive builds. Optional inaccessible security metadata says `unavailable`; that alone must not turn a successful kernel operation into a failed prerequisite. A root invocation is rejected, not used to make otherwise-denied operations pass.

The subsequent uncached test stage still requires `//tools/policy:boundary-test` and `//tools/agent-process:proof-test`. These prove much more than the preflight: filesystem/network isolation, independent boundary controls, lifecycle ownership and hard owner-death cleanup. The owned virtual desktop stage includes topology, agent journey and human-rehearsal targets. No test is removed or converted from unavailable to passing. Rehearsal here is an automated owned-X11 fixture, never the optional physical-desktop launch and never a provider/model request. The pre-existing hosted Chromium `SWARM_ELECTRON_NO_SANDBOX` limitation remains explicitly documented in the workflow; this step introduces no new sandbox exemption.

## Established hosted failure, 2026-09-06

Original I3 merge [run34020316600](https://github.com/tedks/swarm-ide/actions/runs/34020316600) built successfully, then failed the policy seed pipe and required process prerequisite. Its limited diagnostics did not expose the underlying stderr. Desktop verification was skipped, not passed.

C2's first [diagnostic run34022270669](https://github.com/tedks/swarm-ide/actions/runs/34022270669) and targeted [follow-up34038579174](https://github.com/tedks/swarm-ide/actions/runs/34038579174) establish the following on Ubuntu24.04.4, runner image20260831.293.1, kernel6.17.0-1022-azure, UID1001:

| Observation | Actual result |
| --- | --- |
| Host profile / restriction | `unconfined`; AppArmor enabled; `apparmor_restrict_unprivileged_userns=1` |
| Other prerequisite controls | `unprivileged_userns_clone=1`; nonzero namespace quota; parent `Seccomp=0` |
| User-namespace creation | Succeeds; child reports `unprivileged_userns (enforce)` |
| Current-user mapping | Write to `/proc/self/uid_map` returns `EPERM` |
| Exact owned-process prerequisite | Same UID-map write denial after successful namespace creation |
| Private Bubblewrap loopback | `RTM_NEWADDR` response contains `error=-EPERM`; bootstrap exits1 |

This is not absence of kernel namespace support. Required operations inside the newly created namespace are denied. Ubuntu documents that its default AppArmor profile permits unconfined applications to create a user namespace but denies subsequent capabilities inside it. The observed enforced profile and failing operations match that documented mechanism. We did not read a correlated kernel audit record or perform a security-policy toggle experiment, so we do not claim every possible denial contributor was independently eliminated. [Ubuntu24.04 release notes](https://documentation.ubuntu.com/release-notes/24.04/#unprivileged-user-namespace-restrictions)

The pinned Bubblewrap0.11.2 source configures private loopback before UID maps, mount setup and bound-file input consumption; a failure there terminates bootstrap before the synthetic seed can be consumed. This explains why a pipe symptom can mask a namespace bootstrap failure. The original historical run did not preserve raw stderr, so its exact error ordering is not retrospectively proven by the new minimal probe. C2 does not modify the policy harness's diagnostic vocabulary or assertions. [Bubblewrap bootstrap](https://github.com/containers/bubblewrap/blob/v0.11.2/bubblewrap.c#L3067), [private loopback implementation](https://github.com/containers/bubblewrap/blob/v0.11.2/network.c#L127)

The same pinned binaries pass all four probes locally on framework0, where the existing read-only observation is `apparmor_restrict_unprivileged_userns=0`. C2 did not change that value or any host security control. This local result is not evidence that GitHub's different security baseline passes.

## Supported environment decision and stopping boundary

CI pins `ubuntu-24.04`, the same OS family as the observed failing `ubuntu-latest`, to prevent an unrelated automatic family migration. This is not an immutable image pin: GitHub updates hosted images weekly, and the actual image version appears in each job's setup log. The preflight rechecks facilities on each run. [GitHub runner-image support policy](https://github.com/actions/runner-images#software-and-image-support)

No supported environment-only repair was demonstrated within this step's authority. Moving to22.04 solely to lose the newer restriction is not an accepted repair. Ubuntu documents the differing security baselines; GitHub's22.04 runner deprecation starts September17,2026, with retirement April17,2027. `ubuntu-slim` explicitly lacks some mounting/low-level-kernel operations and is not a documented substitute for these proofs. [Ubuntu security matrix](https://documentation.ubuntu.com/security/security-features/security-features-overview/), [GitHub22.04 retirement notice](https://github.com/actions/runner-images/issues/14254), [runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)

The remaining step requires an operator-reviewed runner environment that legitimately supplies the needed namespace capabilities. Ubuntu describes application-specific AppArmor profiles as an accommodation, but installing one or changing the runner product/security baseline is outside C2. Do not disable AppArmor, seccomp or sysctls, use privileged/root test execution, inherit host networking, add setuid workarounds or skip required assertions. Any future accommodation must rerun the unchanged independent policy and external-process tests plus owned virtual UI checks on the actual hosted runner.

The canonical Ditz issue `agent-policy-boundary-hosted-seed-pipe` remains open, as do its blocked hosted-proof obligations. The existing user's local-CI waiver permits landing this reviewed diagnostic increment after actual local verification; it is not a hosted-success claim.

## Evidence and maintenance

Every job uploads `linux-prerequisites.log`, even when preflight fails. JSON quoting prevents raw subprocess text from becoming a GitHub workflow command. Only fixed synthetic commands are traced; there is no incoming-command or environment-dump interface. Desktop artifacts remain target-specific; uncached tests and fresh hosted checkouts avoid presenting an old successful run as current evidence. Missing archives explicitly report their absence.

For focused regression coverage:

    nix develop --command bazel test //tools/ci:preflight-test --jobs=3 --nocache_test_results --test_output=errors

The tests cover exact argv, argument/path rejection, separate UID-map/loopback labels, all-stage/non-root acceptance, optional metadata failure, finite outputs/timeouts, JSON rendering and actual tracer termination of both a synthetic child and grandchild. These tests exercise the diagnostic tool; they do not replace actual hosted positive containment proof.
