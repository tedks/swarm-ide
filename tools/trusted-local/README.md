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
