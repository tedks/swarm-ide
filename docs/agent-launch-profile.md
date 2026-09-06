# Codex 0.153.4 launch-policy blockers: P1 investigation

Status: **not verified; real launch remains `ADAPTER_POLICY_UNAVAILABLE`**.
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
