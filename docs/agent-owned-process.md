# Reproduce the real owned-process fixture proof

This headless test joins the actual Codex JSONL adapter, durable agent service,
private file store and Linux namespace process owner. The executable is a fixed
checked-in Node **protocol fixture**, not Codex or a model. Its synthetic
capability fields exist only to exercise the frozen adapter interface. They
attest neither installed-provider behavior nor effective read-only policy.
Production still returns `ADAPTER_POLICY_UNAVAILABLE`.

From a materialized Nix worktree, run:

    nix develop --command bazel test //tools/agent-process:proof-test --jobs=3 --nocache_test_results --test_output=errors

No display, network port, credentials or external inference is needed. The
target requires working private Linux user/PID/mount namespaces; an unsupported
host fails the explicit proof with an unavailable prerequisite, rather than
silently reporting skipped lifetime cases as success. The ordinary quality
suite may skip the positive cases on unsupported hosts; that is not positive
process-lifetime evidence. No weaker process-group fallback exists.

## What is exercised

One run is admitted to the actual atomic store before the first owned transport
is constructed. The fixed protocol performs initialize/thread/turn negotiation
through the real parser and produces normalized literal HTML and multibyte
text. Repeating the known launch or instruction receipt does not dispatch again.

In the Stop/completion race, a Stop request is not interruption evidence and
the matching completed turn remains completed. The test observes successful
durable store updates: cancelling/live/pending cleanup, completed/live/pending
cleanup, then completed/exited/confirmed cleanup. It does not sample a fleeting
UI state. Both the provider and its detached descendant deliberately survive
SIGTERM; the existing owner must terminate the private PID namespace. An
independently owned canary outside it remains alive and is cleaned by its exact
test handle afterwards.

In the unexpected-exit case the fixed provider exits 17 without acknowledging
steering or sending a terminal turn. The service preserves unknown execution
and delivery-unknown steering, even though namespace teardown is confirmed.
An exit status is not a model outcome.

In the hard-core-death case a separate, fixed test core owns the same real
service/store/adapter/transport. After durable pending steering is actually sent,
the test kills its live handle with SIGKILL. JavaScript shutdown handlers cannot
run. Control-pipe loss still causes the guardian to terminate namespace
descendants. Reopening the actual store/service preserves unknown execution,
delivery-unknown steering and **unknown cleanup**; independent test observations
are not injected as recovered product knowledge. Another launch stays blocked
and the replacement constructs no transport or replays any mutation.

## Evidence and limits

Bazel prints its test log directory. `test.outputs/outputs.zip` there contains
`owned-process.json`: synthetic admission and method counts, durable transition
sequences, observed namespace identities and canary/teardown results. Witness
records are bounded synthetic observations, not cleanup authority. No numeric
PID from those records is ever signalled. Only the existing guardian's normal
namespace-init reap confirms transport cleanup; tests separately inspect the
namespace for surviving non-zombie processes.

The fixture has fixed scenarios, bounded input/output and a 30-second safety
deadline. The dedicated target has a 60-second outer deadline. Tests close
owned services/transports, kill only their own core/canary handles, check observed
namespace cleanup and remove only their private temporary data. Build output
contains test source, but production main/worker dependency tests exclude all
fixture modules; no executable selector or test control reaches the renderer.

This is an external-process composition proof, not the complete first real
agent-run gate. Effective policy, actual credentialed provider lifetime,
write-enabled worktrees, swarm orchestration and watched-app adoption remain
separate decisions. The earlier [cockpit rehearsal](agent-journey.md) supplies
UI evidence without repeating an Electron scenario here.
