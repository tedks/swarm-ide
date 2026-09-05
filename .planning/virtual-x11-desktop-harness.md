# Isolate desktop verification in an owned virtual X11 session

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `.planning/PLANS.md` from the repository root and must remain self-contained enough for a contributor unfamiliar with this repository to complete or audit the work.

## Purpose / Big Picture

After this change, `nix develop --command bazel run //tools:desktop-smoke` launches and tests Swarm IDE entirely inside a disposable virtual X11 desktop. It does not need a pre-launched app or a logged-in physical desktop, and a hostile inherited `DISPLAY=:0` cannot redirect any discovery, input, focus, or screenshot command to the developer's session. The existing topology/source smoke and zoom smoke share one exact-window driver, produce attributable screenshots and logs, and leave unrelated displays, ports, and processes untouched.

The visible proof is a reported artifact directory containing the virtual desktop's supervisor log, application log, ownership manifest, resource measurements, and scenario screenshots. CI runs a representative smoke without a physical display and uploads the same evidence.

## Progress

- [x] (2026-09-05 21:36Z) Verified clean synchronized master at merge `8176e758d4e92a724e9d802d835fa28cbc9afd44`, created `feature/virtual-x11-desktop-harness` in `/home/tedks/Projects/swarm-ide/virtual-x11-desktop-harness`, and started Ditz issues `desktop-x11-driver` and `virtual-x11-desktop-smoke`.
- [x] (2026-09-05 21:38Z) Inspected the current smoke scripts, Bazel targets, Nix shell, CI workflow, dev launcher, renderer marker, and port resolver; recorded the security and lifecycle model in this plan.
- [x] (2026-09-05 21:49Z) Implemented and unit-tested the shared owned-display and exact-window driver, including hostile ambient-display, decoy, ambiguity, input/capture failure, token mismatch, dead server, and PID-reuse cases.
- [x] (2026-09-05 22:00Z) Implemented and adversarially tested the bounded virtual desktop supervisor, including display/port conflicts, missing and crashing dependencies, app exit, scenario failure/timeout, signals, unrelated-process survival, and reuse after teardown.
- [x] (2026-09-05 22:00Z) Moved topology/source, zoom, and the pre-existing HMR probe onto the shared driver; proved all three end to end under hostile inherited `DISPLAY=:0`, with exact screenshots and clean teardown.
- [x] (2026-09-05 22:00Z) Added Nix dependencies, Bazel run/test entrypoints, undeclared-output routing, CI coverage/upload, and contributor/development documentation.
- [x] (2026-09-05 22:03Z) Ran the full Bazel build and uncached `//...` test gates, inspected exact topology/source and zoom screenshots, and captured per-process RSS/PSS, timing, PID/session, and cleanup evidence without targeting `DISPLAY=:0`.
- [x] (2026-09-05 22:32Z) Remediated the first council and hosted-CI findings: cleanup status now propagates, child-registration signals are race-safe, PID/session identity is revalidated, HMR replacement is expected-first and atomic, reload proof requires a fresh renderer title, CI's Electron sandbox exception is explicit and narrow, and uploaded evidence is unpacked.
- [x] (2026-09-05 22:32Z) Re-ran topology/source, zoom, HMR, the CI-shaped Bazel smoke, and focused hostile tests under inherited `DISPLAY=:0`; all used owned `:90`, produced exact-window screenshots, restored source, and cleaned port/display/process state.
- [x] (2026-09-05 22:44Z) Reached council fixpoint after four scoped rounds: the native Codex and foreign Antigravity seats both returned CLEAN on the final delta; Claude's foreign seat remained explicitly unfilled after its initial 900-second timeout. The final local gate built 19 targets and passed all five uncached Bazel test targets.
- [ ] Receive green hosted CI, merge normally, synchronize master and Ditz, and clean only feature-owned resources.

## Surprises & Discoveries

- Observation: both current desktop scripts require an externally launched app and operate directly on inherited `DISPLAY`; their selector and activation implementations are duplicated.
  Evidence: `tools/desktop-smoke.sh` and `tools/desktop-zoom-smoke.sh` each call unqualified `xdotool`, `wmctrl`, and ImageMagick `import` after only checking that `DISPLAY` is non-empty.

- Observation: the existing development launcher supplies a strong inert renderer marker but not an explicit supervisor identity.
  Evidence: `tools/dev.mjs` appends `--swarm-window-marker=http://127.0.0.1:<port>/`; the new supervisor can add process-session membership as an independent ownership proof without changing product code.

- Observation: Electron renderer children can exit between a `ps` session snapshot and `/proc/<pid>` validation during teardown.
  Evidence: the first real topology run completed every UI assertion but cleanup initially reported two just-vanished renderer PIDs as unsafe. Treating a missing `/proc` entry as already-clean while retaining strict start-time checks for live PIDs made the repeated real run clean.

- Observation: Bazel filters custom shell variables from test actions unless the rule explicitly inherits them, and a `manual` tag excludes even an explicitly named test target.
  Evidence: the first test-shaped smoke retained `app.log` in `outputs.zip`, showing `SWARM_ELECTRON_BIN is unset`; after declaring `env_inherit`, it passed. Removing `manual` changed the explicit target from “0 test targets” to one passing test.

- Observation: HMR measurement is itself GUI automation and therefore had to enter the virtual gate even though stable-window reload behavior is a later slice.
  Evidence: the old `tools/measure-hmr.sh` directly inherited `DISPLAY` and duplicated title/PID selection. It is now a scenario under the owned supervisor, and its source edit is restored only when the file equals the expected scenario-produced content.

- Observation: a background `setsid` child can briefly retain its parent's session before `exec`, so reading `/proc/<pid>/stat` immediately is not yet a valid ownership record.
  Evidence: the first post-review adversarial run observed the pre-exec identity. Registration now waits a bounded one second for the exact `session == pid` transition while deferring signals until that identity is saved.

- Observation: GitHub's immutable Nix store cannot provide Electron's root-owned mode-4755 `chrome-sandbox` helper.
  Evidence: hosted smoke run `33994799916` stopped in Electron before window creation. CI now opts into Chromium `--no-sandbox` with one exact environment value; local runs keep the operating-system sandbox. In CI, renderer API restrictions and context isolation remain configured, but Chromium's OS sandbox is disabled.

## Decision Log

- Decision: Use an owned Xvfb server and Openbox window manager, both started in dedicated process sessions under a mode-0700 per-invocation runtime directory.
  Rationale: Xvfb is lightweight and headless; a real minimal window manager makes activation and geometry behavior deterministic; independent process sessions allow bounded group teardown without name-based killing.
  Date/Author: 2026-09-05 / Codex

- Decision: Bind every driver operation to an ownership record containing a random token, display, Xauthority path, and live X-server PID/start time, and pass `DISPLAY` plus `XAUTHORITY` explicitly to every GUI command.
  Rationale: Environment inheritance alone is not proof of ownership. The record and `/proc` identity check make accidental fallback to the ambient desktop fail closed and protect against PID reuse.
  Date/Author: 2026-09-05 / Codex

- Decision: Accept a window only when its title shape matches, its X11 PID command line contains the exact slash-terminated renderer marker, and its process session equals the newly launched dev process session; reject ambiguity.
  Rationale: Title-only and first-match discovery are vulnerable to decoys. The marker distinguishes ports such as 5517 and 55173, while session membership binds the renderer to this invocation.
  Date/Author: 2026-09-05 / Codex

- Decision: Keep scenarios separate from lifecycle supervision and make them source one shared driver for discovery, activation, waits, geometry, input, and capture.
  Rationale: Scenarios should express user behavior, while the supervisor and driver centrally enforce security and ownership rules for all current and future UI tests.
  Date/Author: 2026-09-05 / Codex

- Decision: Fail on an explicitly requested occupied display or port; automatically scan a bounded nonzero display range only when no display was requested.
  Rationale: Reaching into existing state is unsafe. Explicit conflicts should be intelligible, while automatic allocation is useful for CI concurrency and must use an atomic per-display lock plus socket checks.
  Date/Author: 2026-09-05 / Codex

- Decision: Use Bazel undeclared outputs for the test form and a timestamped repository artifact directory for `bazel run`; keep the owned runtime directory ephemeral.
  Rationale: CI retains supported test artifacts, local runs remain easy to inspect, and secrets such as the Xauthority cookie are not preserved after teardown.
  Date/Author: 2026-09-05 / Codex

- Decision: Put the existing HMR probe behind the same supervisor and shared driver, but make no change to Electron reload behavior.
  Rationale: retaining an ambient-display automation target would leave the security gate incomplete. Moving the probe is infrastructure work; changing native-window restart semantics remains the explicitly separate next step.
  Date/Author: 2026-09-05 / Codex

- Decision: Permit Chromium's `--no-sandbox` only when `SWARM_ELECTRON_NO_SANDBOX` is exactly `1`, and set it only in hosted CI.
  Rationale: CI cannot satisfy the setuid-helper requirement, but an implicit or loosely parsed exception could weaken local execution. A pure validated argument resolver keeps the OS-sandbox deviation explicit and testable while renderer API restrictions and context isolation remain configured.
  Date/Author: 2026-09-05 / Codex

## Outcomes & Retrospective

Implementation, local verification, and council convergence are complete; hosted CI and merge remain. The latest topology/source run reached its exact window in 2.026 seconds and completed in 26.277 seconds, including a 19.725-second fixture build. The zoom run reached its window in 2.088 seconds and completed in 9.705 seconds. The HMR run completed in 2.519 seconds and observed its pixel change in 125 milliseconds; the source SHA-256 was identical before and after.

The topology run's combined proportional set size was 836 MiB at readiness and 957 MiB after the scenario; zoom measured 873 MiB and 969 MiB. Aggregate RSS was 1.34–1.62 GiB because Electron processes count shared pages repeatedly. This is acceptable for the correctness gate but expensive enough to track as a separate optimization rather than widening this infrastructure slice.

## Context and Orientation

Swarm IDE is an Electron application whose React renderer is served by Vite during development. `tools/dev.sh` enters `tools/dev.mjs`, which builds the Electron main process, preload, and privileged local-core worker, starts Vite, and launches Electron. `tools/dev-port.mjs` derives the loopback URL and an inert command-line window marker from `SWARM_DEV_PORT`. The renderer's development-only title reports semantic state that desktop scenarios wait on.

`tools/desktop-smoke.sh` currently finds an already-running marked window and drives the topology build and source editor. `tools/desktop-zoom-smoke.sh` separately repeats selection, activation, title polling, input, and capture for zoom behavior. Both inherit the caller's X11 display. `tools/BUILD.bazel` exposes them only as manual `sh_binary` targets. `flake.nix` supplies input and capture tools but not a virtual X server, Xauthority utility, or window manager. `.github/workflows/ci.yml` runs only the normal build and test targets.

An owned virtual display means an X server created by this invocation, authenticated by a cookie stored inside its private runtime directory, and proven live by the PID plus process start time saved there. A process session is the kernel identity shared by a process tree started with `setsid`; it lets the selector prove that the Electron renderer belongs to this invocation and lets teardown signal only the launched group. An undeclared output is Bazel's supported directory for retaining files produced by a test, exposed as `TEST_UNDECLARED_OUTPUTS_DIR`.

The implementation must never use the user's actual `DISPLAY=:0` for selection or automation. Reading ambient environment variables only to replace or reject them is safe; connecting a GUI command to that display is not. The existing master application on port 55173 and the unrelated owner of port 5173 must continue running throughout this work.

## Plan of Work

First, add `tools/x11-driver.sh` as a sourceable shell library. It will validate required environment variables and the private ownership record before every GUI operation. It will provide exact marked-window discovery, activation, title and state waits, geometry, keys, text entry, pointer clicks, and screenshots. Command paths and a synthetic proc root will be narrow injectable seams for tests, but production defaults will resolve only Nix-provided tools. Every call will use `env DISPLAY=<owned> XAUTHORITY=<owned>` explicitly. The driver will reject display zero, missing or mismatched records, dead or PID-reused X servers, windows outside the launched app session, and multiple valid candidates.

Second, add `tools/virtual-desktop-run.sh` as the lifecycle supervisor. It will choose or validate a nonzero display, acquire an atomic lock, create a private Xauthority cookie, start Xvfb and Openbox in their own sessions, verify both are live within bounded waits, verify the requested loopback port is free, and launch the development app in another new session. It will store PID start times before trusting or killing a group. It will wait for port and exact-window readiness, then invoke one scenario under a bounded timeout. Its signal and exit traps will terminate only identity-matched process groups, escalate after a bounded grace period, tolerate repeated cleanup, remove only its token-matched display lock and private runtime directory, and always report retained diagnostic artifacts.

Third, split the current scripts into thin Bazel-facing wrappers and scenario scripts. `tools/desktop-topology-scenario.sh` and `tools/desktop-zoom-scenario.sh` will use only shared driver functions for GUI work. `bazel run //tools:desktop-smoke` and `bazel run //tools:desktop-zoom-smoke` will each supervise their own app and desktop. A Bazel `sh_test` will run the topology scenario as the representative CI gate and route evidence to `TEST_UNDECLARED_OUTPUTS_DIR`.

Fourth, add focused shell tests. Driver tests will inject deterministic X11 command shims and synthetic proc state to prove hostile ambient display replacement, ownership refusal, wrong-title and same-title/wrong-process decoy rejection, ambiguity rejection, and screenshot/input failure propagation. Supervisor tests will inject small real child processes and command shims to prove missing dependencies, failed X server or WM, occupied or stale display, port collision with survival of its unrelated listener, app exit before readiness, scenario timeout/failure, signal cleanup, and teardown idempotence. The production path will still be exercised end to end under real Xvfb and Openbox.

Fifth, add Xvfb, Xauthority, Openbox, X11 readiness utilities, and process utilities to `flake.nix`; expose source and test targets in `tools/BUILD.bazel`; document the self-contained loop in `AGENTS.md`, `README.md`, and `docs/development-loop.md`; and make CI run and upload the representative virtual desktop test. No product renderer or stable-window reload behavior belongs in this slice.

Finally, run all quality gates through `nix develop --command bazel ...`, force an uncached full test run, run both real desktop scenarios on the owned virtual display, inspect their screenshots, and compare `DISPLAY=:0` window/focus state only through a non-automating external observation if that can be done without violating the boundary. Record elapsed startup, scenario duration, and resident-memory snapshots. Push granular commits, maintain the draft PR, run the provider-diverse council to fixpoint, require green hosted CI, merge normally, synchronize master and Ditz, close both issues, and stop only feature-owned UI and Bazel processes.

## Concrete Steps

All commands run from `/home/tedks/Projects/swarm-ide/virtual-x11-desktop-harness` unless noted.

Create the branch and worktree, start issues, and open the plan:

    git worktree add -b feature/virtual-x11-desktop-harness /home/tedks/Projects/swarm-ide/virtual-x11-desktop-harness master
    nix run github:tedks/ditz -- start desktop-x11-driver
    nix run github:tedks/ditz -- start virtual-x11-desktop-smoke

During implementation, use only Bazel entrypoints inside Nix:

    nix develop --command bazel test //tools:x11-driver-test //tools:virtual-desktop-supervisor-test --test_output=errors
    nix develop --command bazel build //...
    nix develop --command bazel test //... --test_output=errors --nocache_test_results
    SWARM_VIRTUAL_DESKTOP_PORT=55174 nix develop --command bazel run //tools:desktop-smoke
    SWARM_VIRTUAL_DESKTOP_PORT=55174 nix develop --command bazel run //tools:desktop-zoom-smoke

Run the representative Bazel test form and expect artifacts under its undeclared output tree:

    SWARM_VIRTUAL_DESKTOP_PORT=55174 nix develop --command bazel test //tools:virtual-desktop-smoke-test --test_output=streamed --nocache_test_results

The successful supervisor transcript must report its nonzero owned display, artifact directory, exact window ID/PID, app session, startup time, scenario time, and resource snapshot. Failure transcripts must name the failed phase and the artifact directory without silently falling back to another display or port.

## Validation and Acceptance

The focused adversarial Bazel tests must pass and must exercise every requested failure class. The test logs must prove that a hostile ambient `DISPLAY=:0` never reaches an injected GUI command, decoys are rejected unless both marker and session match, unrelated port listeners remain alive, and repeated cleanup does not signal an unowned or PID-reused process.

`nix develop --command bazel build //...` and the uncached `nix develop --command bazel test //... --test_output=errors --nocache_test_results` must pass. The real topology and zoom scenarios must each launch their own Xvfb/Openbox/app stack on port 55174, capture nonempty PNGs for the exact accepted window, satisfy their semantic title and pixel-difference assertions, and tear down their display socket, lock, port listener, and owned process sessions. They must not create, focus, resize, type into, or screenshot a window on `DISPLAY=:0`.

Hosted CI must install dependencies through Nix, build and test with Bazel, run the representative virtual desktop smoke without a logged-in desktop, upload its diagnostics even on failure, and finish green. Council review must reach a round with no new Critical or Important findings, with every other finding either fixed or filed narrowly.

## Idempotence and Recovery

Every run receives a unique private runtime directory and token. Automatic display allocation acquires an atomic lock before starting Xvfb; explicit occupied displays fail without modifying their sockets or locks. Cleanup checks each PID's saved kernel start time and process-session identity before signaling its group, checks the lock's token before removing it, and can run more than once. A failed run can be retried after reading its retained artifacts; no manual process-name cleanup should be necessary.

If the app or scenario fails, preserve logs and screenshots but delete Xauthority and the runtime directory after copying a non-secret ownership summary. If teardown cannot stop an identity-matched child after TERM and KILL, report the PID/session and fail the run rather than broadening the kill target. Do not remove or signal anything merely because it uses the same executable name, window title, display number, or TCP port.

## Artifacts and Notes

The local artifact layout will contain at least `supervisor.log`, `xvfb.log`, `wm.log`, `app.log`, `scenario.log`, `ownership.txt`, `resources.tsv`, and scenario PNG files. Under a Bazel test, the same hierarchy lives below `TEST_UNDECLARED_OUTPUTS_DIR`. The Xauthority cookie itself is never copied into artifacts.

The master app on 55173 is outside this plan. Port 5173 is known to belong to another legitimate project and is never probed beyond the general assertion that this supervisor must not select or kill listeners it did not start.

## Interfaces and Dependencies

`tools/x11-driver.sh` will export shell functions named `swarm_x11_assert_owned`, `swarm_x11_exec`, `swarm_window_select`, `swarm_window_activate`, `swarm_window_wait_title`, `swarm_window_geometry`, `swarm_window_key`, `swarm_window_type`, `swarm_window_click`, `swarm_window_capture`, and `swarm_window_title`. The selected window ID and PID will be exported as `SWARM_WINDOW_ID` and `SWARM_WINDOW_PID`. Calls return nonzero with a precise diagnostic rather than choosing a fallback.

`tools/virtual-desktop-run.sh` accepts a scenario executable and the development launcher as arguments. It exports the owned `DISPLAY`, `XAUTHORITY`, ownership-directory path, app session, renderer marker, artifact directory, and driver path to the scenario. Production defaults are Xvfb, xauth, Openbox, xdpyinfo, wmctrl, xdotool, ImageMagick, Node.js, and standard process utilities supplied by `flake.nix`; tests may replace a command only through documented absolute-path environment seams.

Revision note (2026-09-05): Initial executable plan created after inspecting the merged PR #4 baseline. It fixes the ownership, selection, lifecycle, artifact, adversarial-test, and landing decisions before implementation so later discoveries can be compared against an explicit security model.

Revision note (2026-09-05 21:49Z): Marked the shared driver milestone complete after `//tools:x11-driver-test` passed uncached. The implementation rechecks title, PID, marker, process session, X-server start time, and ownership before operations rather than trusting discovery output.

Revision note (2026-09-05 22:00Z): Recorded the completed supervisor, scenario migration, Nix/Bazel/CI wiring, real-run evidence, teardown race resolution, and HMR boundary decision. Full repository gates, hosted review, and landing remain.

Revision note (2026-09-05 22:03Z): Marked local repository validation complete after all 17 Bazel build targets and all four Bazel test targets passed uncached; the test suite includes 105 application tests plus the driver, supervisor, and real virtual-desktop gates. Resource output now records proportional set size as well as aggregate resident size so Electron shared-memory accounting is not overstated.

Revision note (2026-09-05 22:32Z): Recorded first-round council and CI remediation, post-exec session registration, explicit CI-only Chromium sandbox handling, atomic HMR mutation, fresh-renderer reload proof, unpacked CI artifacts, and updated real-run timings/resources. The remaining gate is review/CI convergence and normal merge.

Revision note (2026-09-05 22:44Z): Recorded council fixpoint and the final five-target uncached Bazel gate. Review closed display-lock registration, HMR temporary-file cleanup, signal-output capture, and stale-member identity gaps; hosted CI and normal merge remain.
