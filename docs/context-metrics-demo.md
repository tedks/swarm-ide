# Context: relationships before bookkeeping

Context follows the deliberately inspected file or service. Global working,
built and deployed state now lives at the top of that pane, including during
task or external-agent inspection. These remain independent observations: a
retained build is not relabelled current merely because a replacement core is
ready, and a global deployment does not establish which files it contains.

## Build targets

Inspecting a file consumes the existing nonforced Bazel graph observation, even
if the Build graph tab is closed. This can start a cached, owned Bazel query; it
does not compile binaries or write source. Direct targets reference the exact
source label. Indirect targets reach that label through dependency paths, with
direct targets excluded. Generated-output intermediates are traversed, cycles
terminate, and unresolved labels are not reported as known rules. Forward
dependencies and unrelated sibling rules are not file consumers.

The index is rebuilt only for a changed bounded observation. Per-file results
are cached (128 entries); each section shows at most 32 relationships with the
full returned count. Query scope, retained status and provenance remain visible.
“No targets” means none in the displayed observation, not a claim of complete
ownership knowledge. Missing observations say so compactly.

## Latency

Latency is a separate table with mean, median, p90 and p99 in milliseconds.
Current values are **Illustrative**, not sampled production data. The authored
profile describes a 15-minute, 12,000-request example load and names operations;
it does not claim to parse or follow the function under the cursor.

There are two explicit associations. The repository example
`examples/checkout-world/services/fraudcheck/fraudcheck.ts` gets the profile
when the observed direct targets include
`//examples/checkout-world/services/fraudcheck:fraudcheck_sources`. Alternatively,
a saved source file can declare the exact comment tag:

    // @swarm-demo-latency checkout.assess

A `#` comment works too. This is an authored demo marker, not a telemetry
integration. Unsaved tags do not activate profiles. A file with neither
association shows a small “No latency profile” state and does not inherit the
previous file's numbers. Existing source reads supply text; no new scanner or
filesystem capability is introduced.

## Source and services

The provider-unavailable wall, separate local-buffer card and local-file digest
display are removed. The Working source section retains source status, receipt
provenance and actionable error/conflict/unknown-save messages alongside an
unsaved-build warning. Revision checks are unchanged internally.

Declared service/interface membership remains exact and source links retain
their existing attention/revalidation rules. Deployed services are a separate
compact instrument. There is currently no file-to-deployment provider, so it
shows “No services” with that scope; an owning target or global deployment ID
must not manufacture deployment membership. Existing Ditz backlinks remain
revision-pinned and actionable.

## Local verification

From the designated worktree, materialize dependencies with
`nix develop --command pnpm install --frozen-lockfile`, then run:

    nix develop --command bazel test //:quality //tools/context-metrics:regressions --jobs=3
    nix develop --command bazel test //tools/context-metrics:packaged-context-test --jobs=3 --test_env=SWARM_VIRTUAL_DISPLAY=:139 --test_env=SWARM_VIRTUAL_DESKTOP_PORT=55219

Choose a free owned virtual display/port if those are in use. The packaged
journey creates a disposable real Git/Bazel repository, opens three ordinary
files, checks exact direct/transitive/empty relationships and an explicitly
tagged illustrative latency table, and verifies retained unsaved text/draft and
graph identity through final cursor movement. It never injects a workspace
snapshot or calls an agent. Evidence is in Bazel's undeclared test outputs;
the virtual supervisor owns and cleans its processes.
