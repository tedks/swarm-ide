# Codex 0.153.4 launch-policy blockers: P1 investigation

Status: **full effective policy not verified; real launch remains `ADAPTER_POLICY_UNAVAILABLE`**.
This is a bounded source investigation, not a launch recipe or evidence of
authentication. No product helper or capability upgrade is delivered. Runtime
continues to own `core/agents/policy.ts`, the adapter, and integration.
P1 is this policy workstream; E1 was the context/preflight investigation;
R2/W2/E2 are runtime, workbench and test-harness slices in the
[first-agent execution plan](../.planning/first-agent-run-wave.md). ROOT is the
supervising session that accepts and sequences their work.

## Purpose and assumptions

The first agent journey needs read-only analysis beside the source editor,
without hidden hooks, MCP servers, connectors, plugins or delegated agents.
An accepted setting is not an effective restriction; an effective restriction
observed before spawning is not evidence about the process later spawned.

Assume a trusted local project and operator-owned harness, but defend against
unexpected inherited configuration, changing config files, aliases, managed
requirements, missing observations and version changes. This is not protection
against a hostile same-account process replacing executable code or the OS.
Read-only still permits account-readable host access. Selected prompt bytes are
explicitly submitted to the configured model service; no confidentiality or
authentication acceptance is claimed.

## Evidence identity

Observed on 2026-09-06 UTC (the preceding evening in America/New_York): the
complete installed npm package is `@openai/codex` 0.153.4. The platform manifest
reports `layoutVersion: 1`, its executable/resource directory format. The launcher is
`/home/tedks/.npm-global/bin/codex`; its package resolves under
`/home/tedks/.npm-global/lib/node_modules/@openai/codex/`. Its nested
`node_modules/@openai/codex-linux-x64/` platform package's
`vendor/x86_64-unknown-linux-musl/bin/` contains both executables:

| File | Observed SHA-256 |
| --- | --- |
| `codex` | `56ef98ab4032d317ab26e9b5e5a175650717351edb16ed9cde0cb6d1734d62da` |
| `codex-code-mode-host` | `3e85d67471825f73d02ff5f7e047ca1f6ca8caa3f59e4c6e8d9ca6ca7302cb45` |

Read-only inspection used installed `--version` and help, package manifests,
E1's generated schemas archived under the ignored
`master/artifacts/first-agent-wave-final/evidence/` directory, fetched official
docs, and a disposable checkout of the package's
declared upstream repository `https://github.com/openai/codex.git`:
tag `rust-v0.153.4`, peeled commit
`3d2ee51ca2d5db578f328aa75e20aa22c0197c9a`.
Source references below are relative to that exact commit, not upstream HEAD.
Matching version labels are not a reproducible-build or signature attestation
that these binary bytes were built from that source. Hashes identify the local
observation, not a portable production allowlist.
Version/help execute ordinary CLI argument handling; they returned metadata/help
and exited. They were judged lower risk than config loading, not proof of an
isolated process. The network-capable `features list` path was not invoked.

The [official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
documents per-server MCP enablement and hook settings; the
[app-server reference](https://learn.chatgpt.com/docs/app-server) documents config
inspection. They establish supported interfaces, not this installed process's
enforcement. Release-source analysis below supplies the additional findings.

## Findings beyond schema inspection

1. **Startup precedes inspection.** `codex-rs/app-server/src/lib.rs:504`
   loads config, constructs an authentication manager and installs the cloud
   config loader before client initialization.
   `codex-rs/app-server/src/message_processor.rs:369` starts the model refresh
   worker, and `:525` starts plugin warmups.
   These are startup paths, not proof they actually contacted a service here.
   No server was started in P1. A later `config/read` cannot retroactively make
   unsafe startup safe.

2. **An isolated user config is not the entire configuration boundary.**
   `codex-rs/config/src/loader/mod.rs:100` describes packaged, system, cloud,
   user/profile, project, runtime and managed layers/requirements. At `:364`
   project discovery also considers runtime settings and managed config.
   `codex-rs/cli/src/main.rs:1287` invokes app-server with
   `LoaderOverrides::default()`. The internal ignore-user/project controls are
   not exposed by that CLI path. `-c` and feature overrides do reach app-server;
   the separate top-level `--profile` option does not: the explicit allowlist in
   `cli/src/main.rs:1824` rejects it for this subcommand. Where supported, a
   profile adds a layer rather than erasing inherited configuration.
   `--strict-config` rejects invalid configuration; it is not
   isolation. Non-strict startup can fall back to defaults (`lib.rs:540`).

3. **Empty tables do not clear inherited maps.**
   `codex-rs/config/src/merge.rs:58` recursively merges tables. Therefore an
   empty `mcp_servers` override preserves inherited entries. An empty `hooks`
   or `plugins` table is not a disable-all operation either. Known effective
   MCP server names can receive per-server `enabled=false`; discovering those
   names only after an unsafe startup is insufficient, and discovery must
   account for plugin/executor-provided servers as well.

4. **Aliases matter after merging.**
   `codex-rs/features/src/legacy.rs:11` maps `connectors` to `apps`, `collab` to
   `multi_agent`, and `codex_hooks` to `hooks` through feature IDs whose canonical
   keys are in `features/src/lib.rs:1144`, `:1220` and `:1244`.
   `Features::apply_map` in
   `features/src/lib.rs:553` applies a sorted map to effective feature values;
   `config/src/key_aliases.rs` does not canonicalize these feature aliases.
   In that source, a merged table containing `apps=false` and
   `connectors=true` enables Apps when the later key is applied. This is a
   source-derived counterexample, not an executed installed-binary test.
   `multi_agent_v2` additionally accepts a boolean or a structured table;
   checking JSON value equality against false is not complete resolution.
   CLI feature toggles become config overrides (`cli/src/main.rs:1057`) and
   join the merged feature table; they are not a universal final veto on aliases.

5. **The main hooks flag is not every hook.**
   `codex-rs/hooks/src/registry.rs:113` builds the legacy `notify` callback
   independently of `feature_enabled`. `legacy_notify.rs:45` creates a direct
   subprocess callback, including the turn's notification payload. A profile
   must also establish empty/disabled effective `notify`.
   `hooks/src/engine/mod.rs:239` returns early only when hooks are disabled
   *and* plugin sources are empty; at `:255`, built-in plugin handlers survive
   ordinary-hook disabling. Plugins must be independently disabled.
   `core-plugins/src/manager.rs:761` does return an empty plugin result when
   the resolved plugin feature is disabled, before loading bundled or other
   plugins through that path. Executor hooks are another path:
   `hooks/src/registry.rs:100` attaches them after construction. P1 has not
   established universal exclusion of executor-provided hook sources.
   These are distinct gates.

6. **Config inspection is useful but not an atomic attestation.**
   `codex-rs/app-server/src/config_manager_service.rs:115` reloads layers,
   serializes `ConfigToml`, applies exact requirements and omits packaged
   defaults from returned layers/origins. `request_processors/config_processor.rs:99`
   then reloads config and patches only eight resolved feature fields; the
   list at `:65` does not include hooks/apps/plugins/multi_agent. Exact
   requirements and an injected login-shell default also affect the serialized
   response. A read without the intended canonical cwd can inspect a different
   project context.
   Do not treat raw `config.features` as the fully resolved feature set.
   `request_processors/catalog_processor.rs:310` provides effective feature
   enumeration, optionally for a thread, but reloads configuration again and
   paginates. All required names and all pages must be observed. A missing
   name/page is unknown, not disabled. These separate reads do not pin one
   immutable configuration snapshot for startup and execution.

7. **No-model does not imply no authentication or network activity.**
   Startup may resolve credentials and refresh cloud config/model information.
   The `features list` CLI also constructs a cloud-backed config loader
   (`codex-rs/cli/src/cloud_config.rs:26`); it is not a guaranteed offline
   alternative. A disposable user directory alone does not suppress inherited
   process credentials. Model-free probes need an independently enforced
   offline/no-credential boundary before invoking either path. No credential
   values, auth-file contents or actual environment secrets were inspected.

8. **Other ambient channels need their own exclusion.** Remote control defaults
   to persisted-state resolution (`codex-rs/app-server/src/lib.rs:453`).
   `app-server-transport/src/transport/remote_control/mod.rs:86` describes an
   internal daemon disabled-start marker, explicitly not a public CLI flag.
   Do not invent a supported disable flag from it. Remote plugins, telemetry
   exporters and persisted remote-control state belong in the proof inventory.
   Keyring storage exists (`codex-rs/login/src/auth/storage.rs:252`); hiding auth
   files alone does not hide session-bus credential services.

## Decision and delivered scope

P1 does **not** supply `launch-profile.ts` with a synthetic success result.
There is no defensible available result to export from the evidence gathered.
The useful delivered change is this reproducible source map and the narrower
next proof. The earlier blanket uncertainty is now localized to safe startup,
resolved auxiliary capabilities and process/config identity binding.

Production keeps `unavailablePolicyCapabilities`. The existing
`validateCodexThreadPolicy` success remains necessary-only: exact canonical
cwd, `readOnly`, explicit `networkAccess:false`, and `approvalPolicy:never`.
Neither this report nor a successful config query upgrades it. P1 launched no
app-server, model, tool connector or probe; changed no installation/global
configuration; read/copied/logged no credentials. No authentication claim.

## Smallest next bounded proof

Build a **model-free hostile-config acceptance harness**, not another generic
boolean capability probe. Its first milestone is an owned Linux process
boundary that hides the real credential/config locations and keyring/session
bus access, supplies an explicit non-secret environment without inherited
credential or bus addresses, prevents network independently of Codex, and makes
fixture configuration immutable for the process lifetime. Configuration layers,
requirements and startup state must be fixed; writable owned logs/databases
must be separate and unable to introduce or mutate accepted policy settings.
A separate mount
namespace or disposable account/container is a candidate, not a tested recipe.
Treat namespace support, packaged dependencies and owned descendant cleanup as
acceptance gates; never fall back to the user's ordinary environment. This
candidate is for probing, not a change to the product's declared read scope.

Within that boundary, use the actual complete 0.153.4 package and require the
plain stdio server form with `--strict-config`, no analytics-default opt-in and
verified exporters off. Establish safe startup before creating a thread as
well as before a turn: `request_processors/thread_processor.rs:1441` creates
the session during `thread/start`. Returned policy checks are a later gate,
not permission to create an unconstrained thread first.
Include hostile user/project/managed-layer fixtures, alias collisions, legacy
notify, ordinary/bundled/executor plugin hooks, hook-trust bypass, login-shell
rc files, remote-plugin/control persisted state, companion execution,
per-server MCP entries, malformed strict config and changed config/version/root.
Any required exclusion without a supported, verified mechanism remains unavailable.
Sentinel executables must not execute; outbound attempts must not reach a
network; disabled auxiliary capabilities must be established from effective
source-backed observations, not merely unsuccessful startup or an empty tools
list. No real connectors, auth files, provider tokens or real model requests.
Run only through new Bazel-owned tests, with strict deadline, bounded sanitized
output and owned process-tree cleanup. Any unavailable isolation primitive
must yield a typed unavailable result.

If that succeeds, Runtime can separately add a **core-only per-process setup
seam** that constrains process startup and thread creation, then validates the
returned evidence before `turn/start`. Require strict configuration and verify
all inspection cwd values against the canonical root. Its evidence must bind executable/companion identity,
actual owned process, registered canonical root, loaded configuration and
requirements versions, complete effective-feature/MCP observations, and the
returned thread policy, remote-control/plugin and executor-hook exclusions.
Recheck after relevant changes; a generic earlier
`AgentCapabilities` value is not such a binding. Reject missing observations,
config refresh races and unsupported versions rather than replaying a launch.
If production cannot freeze or detect a relevant configuration race, the
result remains unavailable; this report supplies no race-rejection mechanism.
Config dumps can contain secrets: retain only bounded sanitized decisions and
digests, never export complete responses to renderer or review logs.

ROOT then separately decides credential-preserving production configuration
and authenticated read-only acceptance. The offline fixture result alone must
not authorize a credentialed process with different configuration or inherited
environment. R2/W2/E2 can finish the unavailable/deterministic cockpit without
waiting for this investigation; write-enabled agents remain a later gate.

## P2: executable offline acceptance harness

`tools/policy/` now supplies a standalone experimental harness, not a product
adapter. Run it from a Nix shell exclusively through Bazel:

    nix develop --command bazel test //tools/policy:boundary-test --jobs=3
    nix develop --command bazel run //tools/policy:probe --jobs=3
    nix develop --command bazel run //tools/policy:probe --jobs=3 -- --trace-startup

The first command uses synthetic programs only. The manual probe reads only the
declared complete package under the current user's `.npm-global` installation,
checks its exact 0.153.4 layout, snapshots all declared resources and companions,
and records executable, companion and whole-tree digests. A different layout,
missing file, symlink, unsupported namespace or changed input fails closed.
It never reads the user's Codex configuration, authentication or installation ID.
The returned JSON always has `productionAvailable: false`.

The test runtime is pinned by the existing repository `flake.lock` through a
separate Nix expression. Bubblewrap receives an explicit environment and only
owned pipes, creates private user/PID/network/IPC/mount namespaces, prohibits
nested user namespaces and drops all capabilities. Only individual pinned Nix
runtime closure paths, the copied complete package and synthetic fixture trees
are mounted readonly; no host home, `/run`, `/etc`, `/proc`, entire Nix store or
physical desktop is exposed. Its `/proc` is freshly mounted in the private PID
namespace. State and temporary files use separate private tmpfs mounts. This
assumes trusted host/kernel/operator and immutable Nix store, not protection
against hostile same-account replacement of the harness. Deadline/output bounds
are not a comprehensive process-count/memory-resource sandbox.

Before admitting Codex, independent tests verify readonly policy/configuration
paths and their ancestors, absent host configuration/credential/bus paths,
exact environment, no ambient descriptors, no capabilities/new privileges,
private network with no outbound route, and an executable synthetic canary that
successfully writes inside isolated state. They test output overflow, deadline
termination and SIGKILL of the owner while a detached descendant exists. Kernel
PID-namespace teardown, not a saved-PID kill or process-group guess, owns cleanup.
Uncertain cleanup retains owned scratch and stops before further startup.

An actual startup requirement was found and narrowly accommodated. Codex opens
`CODEX_HOME/installation_id` read/write/create even when an ID already exists
(`core/src/installation_id.rs:19` in P1's source). A file-operation-only trace
observed this EROFS failure; the `.codex/tmp` PATH-alias warning was nonfatal.
The harness therefore gives **one named runtime-identity file** a writable,
Bubblewrap-private copied inode seeded with a fixed synthetic UUID. This is not
a writable host inode or directory. Configuration and all containing directories
remain readonly; tests prove identity in-place writes work but unlink/replacement
and config mutation do not. No real installation ID is inspected or copied.

With that exception, actual 0.153.4 startup and model-free
`initialize`, `config/read`, all nine `experimentalFeature/list` pages and
`configRequirements/read` completed offline. The process starts in `/work`, also
the config-read cwd; feature listing has no cwd parameter. Raw config is not
mistaken for resolved features. Output includes bounded feature booleans, missing
required names, count-only MCP/layer information and named limitations, not raw
config dumps. Strict malformed TOML was rejected. Baseline, alias collision,
project, inherited MCP, legacy notify and managed-requirement fixtures distinguish
what actually loaded from what remains unproved; failed expectations produce a
named unavailable result rather than a fabricated passing profile.

Observed counterexamples include canonical `apps=false` resolving to true with
`connectors=true`, and a managed Apps requirement overriding a false setting.
Legacy notify can remain populated while hooks are false. Sentinel absence
without an activation event is **not** a disabled-hook/MCP/plugin proof. Complete
feature enumeration does not establish effective per-executor/plugin MCP,
built-in/executor hooks, telemetry runtime state, persisted remote-control/plugin
state, thread policy or credentialed-process equivalence. Hook/trust-bypass and
bundled/executor-plugin activation fixtures remain a named follow-up, not covered
by synthetic placeholder configuration or empty tools lists. No thread/start,
turn/start, model request, real connector or authentication acceptance occurs.

The next bounded slice should use this proven offline boundary to test the
remaining auxiliary startup/activation paths with genuine positive controls.
Production process/config binding and credential-preserving admission remain
separate ROOT gates. Do not reuse an offline result as `AgentCapabilities`.

## P3: actual no-model auxiliary activation controls

The explicit manual target exercises real installed 0.153.4 startup, not a mock
adapter. It does not belong to the ordinary hosted test suite, where this local
package is not assumed installed. It never enables product execution:

    nix develop --command bazel test //tools/policy:activation-test --jobs=3 --nocache_test_results --test_output=all
    nix develop --command bazel run //tools/policy:probe --jobs=3 -- --activation

Every case first repeats all 26 independent P2 boundary/lifetime checks using
that exact fixture/package tree. The inner process rechecks the immediate
boundary before actual Codex launch. Complete copied package and input hashes
remain stable; no new mount or writable configuration directory was added.
State and execution trace remain in the existing finite private `/state` tmpfs.
Output, RPC time, observation-file reads and namespace cleanup are bounded. Any
unsupported check fails closed before launch; uncertain cleanup retains scratch.

The only outgoing RPCs are fixed `initialize`, `initialized`, and `thread/start`
with an ephemeral synthetic thread, `/work`, `never` approvals and `read-only`.
There are no externally supplied parameters or replayed sessions. An explicit
allowlist rejects generation, review, compaction, auth, resume and arbitrary
shell operations. `gpt-5.2` is only a fixed catalog name for this fixture; no
model entitlement or model invocation is claimed. No model turn is requested.

An important pinned-source distinction prevents accidental model prewarm:
`core/src/session_startup_prewarm.rs:198` branches on the provider's websocket
capability, not the removed websocket feature flags. `core/src/client.rs:1049`
reads `supports_websockets`; normal built-in provider definitions do not accept
that override (`model-provider-info/src/lib.rs:585`). Both matched fixtures use
the unique synthetic `policy_offline` provider with `supports_websockets=false`,
`requires_openai_auth=false`, no auth/env/bearer fields and a non-listening private
loopback URL. Code-mode prewarm, memories and agent identity are disabled too.
The independent namespace still prevents all outbound traffic and host auth;
configuration alone is not that enforcement. A thread reply must echo the
expected provider/cwd/read-only/never/ephemeral fields before observation passes.

Required stdio MCP startup is actually awaited by
`core/src/session/mcp_runtime.rs:104–150` and
`codex-mcp/src/connection_manager/required.rs:16–59`. Enabled servers are selected
at `codex-mcp/src/connection_manager.rs:249,291`. The fixed canary implements only
MCP initialization, an empty tools list and ping; it cannot execute arbitrary
commands or connect to a network. It records boot and incoming handshake stages
inside private state. File-only `strace` of `execve` observes the executable
attempt before it can run, including failed execution attempts. The successful
Codex exec trace is required too; a missing observer cannot masquerade as zero
canary attempts. Raw traces are not exported.

The first installed-process observations were:

| Fixture | Thread result | Canary exec attempts | Actual canary record |
| --- | --- | --- | --- |
| Required enabled server | Created | 1 | boot, initialize, initialized, tools/list |
| Same config, only enabled=false | Created | 0 | None |
| Enabled user server + empty project MCP table | Created | 1 | Full handshake |
| Full project server definition with enabled=false | Created | 0 | None |
| Required canary deliberately exits during initialize | Required-MCP rejection | 1 | boot, initialize |

Thus absence is compared against a genuine matched positive opportunity and a
successful thread-creation barrier. Failed canary startup is explicitly different
from disablement. These observations end at thread initialization and namespace
teardown, not lifetime exclusion for a future model turn. Startup notifications
were not observed before the thread response in this run, so they are not claimed
as proof; exec attempts and the actual canary handshake carry the observation.
An attempted partial project server definition failed startup; the valid deeper
override fixture supplies the complete fixed server declaration. No fallback
interprets that startup error as disabled MCP.

### Coverage ledger, not production certification

| Requested restriction | Pinned trigger/source | Positive opportunity and observation | Remaining limit |
| --- | --- | --- | --- |
| Named static stdio MCP disabled | Required initialization, sources above | Actual enabled handshake vs disabled zero-attempt thread creation, plus required-failure control | Only these immutable static definitions; not plugin/executor MCP or a later turn |
| Ordinary SessionStart hooks disabled | `session/session.rs:1600–1623` queues source; `session/turn.rs:264,504` executes it | No permitted turn trigger | UNPROVED; do not invent a no-model hook control |
| Legacy notify disabled | `hooks/src/registry.rs:113`, turn completion callback | P2 observes populated callback, no turn completion here | UNPROVED activation |
| Hook-trust bypass, built-in/executor plugin hooks disabled | `hooks/src/engine/mod.rs:239,255`; executor hooks in `hooks/src/registry.rs:100` | No matched installed activation controls here | UNPROVED independently of ordinary hooks=false |
| Plugin/per-executor MCP disabled | `core/src/session/mcp_runtime.rs:154` projects executor-owned configuration | Static MCP controls do not exercise this path | UNPROVED |
| Persisted remote-control/plugin state disabled | `app-server/src/lib.rs:453`; P1 source inventory | Fresh synthetic state, no seeded enabled-state control | UNPROVED; deferred to avoid writable policy ancestry |
| Telemetry disabled | Exporter settings at startup, P1 inventory | Network namespace denies outbound traffic | UNPROVED runtime disablement; denied traffic is not a disabled exporter |
| Credentialed production equivalence | A separately owned, exact admitted process | No host credentials/model turn/product process | UNPROVED; ROOT gate unchanged |

The broader `agent-run-offline-activation-proof` and `agent-run-effective-policy`
issues stay open. No `productionAvailable:true` can be returned by this harness.

P2 hosted run 34012740498 failed the independent boundary before Codex with
`SEED_PIPE_FAILED`, not the older topology timeout. P3 preserves that fatal
classification but briefly drains racing bootstrap stderr under the original
deadline/output limits. Only exact allowlisted observation labels and a truncation
boolean are exported, never raw stderr or an inferred AppArmor/sysctl cause.
`agent-run-policy-hosted-boundary-failure` tracks actual runner support; no test
skip, global runner setting, kernel policy or CI weakening is authorized here.
