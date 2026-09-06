# Durable runtime checkpoint

R2 supplies a core-only service against the frozen six commands. Production
constructs the registered disk-context provider and a private per-workspace
store, so preparation and history are real. It deliberately does not construct
a Codex transport: launch remains `ADAPTER_POLICY_UNAVAILABLE` until the effective
profile and next integration gate are accepted. No model turn is evidence for
this checkpoint; all execution tests use deterministic core-side fixtures.

`createAgentService` takes a `RunStore`, `AgentContextProvider`, `AgentAdapter`,
capability observation and snapshot callback. The renderer cannot select any of
these objects. Its serial decision queue persists admission before invoking an
adapter, pending instruction text/hash before steering, and terminal/receipt
state before publication. Long provider promises do not hold that queue. A lost
acknowledgement is unknown, not permission to replay. Stop waits up to five
seconds for the provider, then requests owned termination. Turn completion,
interrupt acknowledgement, direct process exit and descendant cleanup are
different evidence. Terminal outcomes never regress.

Production main supplies `app.getPath("userData")/agent-runs`; canonical workspace
paths are SHA-256 keyed below it. Store directories are mode 0700 and files 0600,
outside Git, with no-follow reads and validation of hashes, lifecycle and receipt
relationships. A Linux abstract Unix socket locks the directory's inode for one
live writer and is automatically released on core death. Snapshot writes use a
fresh file, file fsync, atomic rename and directory fsync. A failed post-rename
sync poisons the writer rather than acknowledging ambiguous persistence. There
is no automatic deletion, recovery replay, saved-PID signalling or model resume.

The 20-run/64 MiB store and 8 MiB-per-run transcript limits count encoded bytes.
Ordinary writes preserve reserved final metadata/gap capacity. This checkpoint
rewrites a bounded snapshot per update, favoring transactional simplicity over
throughput. `agent-run-store-throughput` tracks batching/journaling and measurement
before high-output or multi-run use. Unknown cleanup blocks another launch;
operator resolution is deliberately not inferred from a missing process ID.

`createOwnedCodexTransport` is a separately tested Linux lifetime primitive.
Trusted operator/core paths name Node, util-linux `setpriv`/`unshare`, the helper
and the target. A guardian outside a fresh user/PID/mount namespace observes a
separate core-control pipe; namespace PID 1 owns the provider. On core death or
Stop, it closes admission, applies a short termination grace, and exits PID 1.
The kernel terminates the namespace descendants, including detached sessions;
normal namespace-init reap is the cleanup proof. Ambiguous forced wrapper death
stays unknown. This follows the [Linux PID namespace lifetime rules](https://man7.org/linux/man-pages/man7/pid_namespaces.7.html)
and [unshare lifetime controls](https://man7.org/linux/man-pages/man1/unshare.1.html).
Missing namespace support and ambient startup injection fail closed. This is
not proof of read-only filesystem policy, disabled MCP/hooks, or confidentiality.

The helper source is `core/agents/owner-process.mjs`; both development and release
bundles compile it to `core/agents/owner-process.js`. A future trusted factory
must pass that absolute bundled path, plus the complete installed dependencies.
Owner changes invalidate only the core; main changes still require deliberate
adoption. No environment or renderer flag enables a fake production backend.

Intentional core replacement waits at most 1000 ms for outstanding agent
acknowledgements (or earlier request deadlines), preserving existing file-save
protection. It then sends private `core.shutdown`, allowing up to 2000 ms to
persist unresolved state and dispose owned work before fallback kill. Actual
crashes have no grace; reload reads history conservatively. Native window,
workspace and editor preservation remain the existing supervisor/renderer
responsibility, not a new window launch.

Verification: `nix develop --command bazel test //tools:quality --jobs=3` exercises
store/service/production/owner/supervisor cases without models. Full tests and
`//tools:desktop-reload-smoke` must use the owned virtual-X11 harness. Next,
`agent-run-runtime-r2-vertical` joins the reviewed E2 fixtures through an explicit
test-only worker and exercises W2's unchanged bridge; it does not unlock real
execution or silently adopt the watched master app.
