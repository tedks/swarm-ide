# Rehearse the integrated agent cockpit safely

This is a credential-free **test fixture**, not a live model run. It uses the
actual source/graph cockpit, Electron main and supervisor, preload bridge,
durable agent service, private file store and registered on-disk context. Only
the provider is E2's deterministic, manually controlled in-process adapter.
Production still returns `ADAPTER_POLICY_UNAVAILABLE` for launch.

## Run it

From this worktree after `nix develop --command pnpm install --frozen-lockfile`:

    SWARM_VIRTUAL_DESKTOP_PORT=55174 nix develop --command bazel run //tools:desktop-agent-smoke --jobs=3

For a repeatable test including the same journey:

    SWARM_VIRTUAL_DESKTOP_PORT=55174 nix develop --command bazel test //tools:virtual-desktop-agent-test --jobs=3 --nocache_test_results --test_output=errors

Serialize these commands with every other automated GUI/full-suite user. Under
an orchestrator, use its shared lock with `flock --close <shared-lock> ...`;
`--close` prevents a persistent Bazel daemon from retaining that descriptor.
An occupied port is an error, never permission to kill its owner. The wrapper
creates an owned Xvfb/Openbox desktop, private application data and fresh run
history, ignoring inherited physical `DISPLAY` and `XAUTHORITY`. It never opens
or reloads the developer's existing application. Do not invoke the internal
launcher directly or point any automation at the physical desktop.

The scenario is automatic and short; it does not leave a persistent fixture
agent waiting for a human. For inspection afterwards, the wrapper prints the
artifact directory. `SWARM_ARTIFACT_DIR` can select an absolute evidence directory
for the manual target. Screenshots and `journey.json` are the durable handoff.
The test target puts them in its Bazel undeclared-output directory.
Hosted CI explicitly includes the new agent test beside the topology test and
uploads its evidence separately; the ordinary non-desktop test filter alone
would skip it. A pending/skipped hosted run is not validation evidence.

## What the proof means

The keyboard palette opens FraudCheck source. A fixed-focus launch draft stays
attached to that source while navigation moves elsewhere; context preparation
reads actual disk bytes and provenance, not the unsaved buffer or a frozen
filesystem. Inspecting and launching admit exactly one fixture run. Literal HTML
and multibyte output are displayed as text beside the source and both graph
instances. The service graph may remain honestly unobserved; this is not a
substitute topology build or a fabricated green graph.

An instruction first becomes durably pending, then accepted by the explicit
adapter reply. A second instruction receives a stale-turn rejection and is not
retried. Stop acknowledgement is distinct from turn completion: a completed turn
wins the deliberate Stop race while cleanup is still pending. Disposal is then
confirmed separately. Screenshot encoding/writes occur **after** releasing the
runtime's bounded cleanup gate, not inside its two-second deadline.

A second explicit run emits more than one bounded history page. Reading pages
and selecting the older run preserve source/editor identity and graph cameras;
only explicit Reveal moves focus. Killing the exact owned utility-process handle
then exercises the real supervisor. Durable history survives, unfinished work
and pending steering become unknown, replacement-core adapter invocation counts
stay zero, and new launch is disabled. This is a crash, not the intentional
1000ms acknowledgement-drain path tested separately by the supervisor suite.

The fixture owns no external **agent/provider** process. Its cleanup confirmation
means its in-process adapter was disposed; it is not namespace cleanup, a zero
exit status, effective provider-policy evidence, or proof that a model stopped.
Normal core/Git observation and the owned Electron/X11 processes do exist. R2's
separate namespace-owner tests supply their own process-lifetime evidence.

## Boundaries and failure diagnostics

Normal production entries have no fixture selector, environment switch or fake
fallback. `tools/agent-journey-dev.mjs` builds separate test main/worker entries;
the normal source dispatcher and six-command public schema are unchanged.
The fixed test main exposes only a one-shot compiled journey through an
owner-private Unix socket. It has no arbitrary JavaScript/command endpoint and
does not expose provider controls to the renderer. The renderer remains sandboxed.

To exercise cleanup after admitted/streaming fixture work, set
`SWARM_JOURNEY_FAILURE_PROBE=1` on the **manual** target. A nonzero exit is expected;
`journey-failure.json`, optional screenshot and `cleanup_complete=1` distinguish
the deliberate scenario failure from an ownership-cleanup failure. A clean exit
without passing the asserted journey is never accepted as proof.

The harness records sanitized lifecycle/diagnostic counters and deliberately
synthetic user text. It does not contact Codex, inspect authentication, export
credentials or attest effective live-provider policy. Real read-only execution,
write-enabled worktrees, queues/swarms and watched-app adoption remain separate
roadmap gates.
