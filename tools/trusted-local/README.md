# Owned packaged trusted-local proof

Run `nix develop --command bazel run //tools/trusted-local:smoke` from the
feature worktree. The existing virtual-desktop supervisor exclusively owns its
Xvfb/Openbox display (default `:138`) and validates the loopback port (default
`55218`) before launch. An occupied display or port fails without adoption.

This is one deterministic protocol proof, not a live-model acceptance claim.
The unchanged packaged Electron main, preload, renderer and local core open a
fresh disposable Git repository. Privileged launcher environment explicitly
selects the test-only `fake-codex.cjs` through `SWARM_CODEX_BIN`; it never invokes
an installed Codex or performs a model turn. The fake asserts the exact working
directory, provider argument list and thread/turn parameter keys, so this proof
fails if approval, sandbox or configuration overrides are added.

Native UI input opens source, leaves unsaved text, opens the existing agent
draft, prepares disk context, confirms launch, receives output and a command
approval, allows it once, sends a second turn, and stops the conversation. The
fake does not execute the proposed command. The proof checks one provider start,
two deterministic turns, one approval response, one interrupt, closed session,
preserved editor and graph instances/cameras, unchanged disk source, and zero
renderer exceptions. `proof.json`, `wire.json` and screenshots are retained
under `artifacts/trusted-local-proof/run.*`; `supervisor.log` records
`cleanup_complete=1`. The disposable app profile, repository, and process owner
live under the supervisor's private temporary directory and are removed at exit.

## Separately authorized live smoke (manual; never part of deterministic smoke)

`//tools/trusted-local:live-bundle` only compiles the proof. Building it does not
start Codex. The separate `//tools/trusted-local:live-smoke` entry must receive
native/local review and explicit operator authorization before execution. Do not
run it as routine validation, through `//...`, or after an uncertain result.

The live entry requires `SWARM_TRUSTED_LIVE_SMOKE=1`,
`SWARM_TRUSTED_LIVE_CODEX=/tmp/swarm-ide-codex-runtime.70xtjj/codex`, and
`SWARM_TRUSTED_LIVE_EVIDENCE` naming an existing private, owned absolute directory.
After review and authorization, its entry point is
`nix develop --command bazel run //tools/trusted-local:live-smoke` with those
explicit environment values. No default provider executable or evidence path is
accepted. The exclusive `one-turn-consumed.json` marker is never removed: a
repeat invocation with the same evidence directory fails before provider start.
An uncertain result requires renewed authorization, not a new evidence directory
or removal of the marker to bypass the consumed attempt.

It creates a fresh empty disposable working directory and uses the actual
`TrustedLocalSession` and PID-namespace owner. It inherits ordinary authentication,
configuration, permissions and model selection without reading/copying
credentials, injecting policy overrides or attaching source files. The one and
only prompt is “Reply Swarm IDE launch verified; do not read or modify files or
use tools”. The proof never sends a second turn and never answers an approval.
Any approval, failure, operator signal or 75-second deadline stops the session;
successful turn completion also immediately stops it. This is not a filesystem
sandbox promise: the prompt asks the normally configured provider not to use
tools. Evidence contains only bounded, control-character-sanitized conversation
output, outcome and owner cleanup status, never raw provider diagnostics. The
disposable workspace is removed after owned Stop; auth/configuration and the
consumed marker are preserved.
