// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const build = "Build repository service topology";
const sourcePath = "examples/checkout-world/services/fraudcheck/fraudcheck.ts";
const contractPath = "examples/checkout-world/services/fraudcheck/fraudcheck.proto";
// Functions are sourced by the real scenario; no desktop, Bazel, clock or image
// processor is involved. Commands count only when Return actually dispatches them.
const driver = String.raw`
zoom=0
builds=0
epoch=40
core=1
doc=100
pending=""
palette=closed
surface="Graphs"
state="Consistent"
record() { printf '%s\n' "$*" >> "$SCENARIO_LOG"; }
sleep() { :; }
date() { echo 1000; }
magick() { echo 2000; }
identify() { :; }
swarm_x11_assert_owned() { :; }
swarm_window_assert_selected() { :; }
swarm_window_geometry() { printf 'WIDTH=1280\nHEIGHT=800\n'; }
swarm_window_click() { :; }
swarm_window_capture() { record "capture|$(basename "$1")"; }
swarm_window_title() {
  local color=yellow
  [[ "$state" != Consistent ]] || color=green
  echo "swarm-ide — $surface — Zoom 100%@$zoom — $state — FraudCheck visible — Core $core:ready — Doc $doc — Topology $epoch:$color"
}
swarm_window_type() { pending="$1"; }
swarm_window_key() {
  case "$1" in
    ctrl+0) zoom=1 ;;
    Escape) palette=closed ;;
    ctrl+k) palette=command ;;
    Return)
      record "command|$pending"
      if [[ "$palette" == path ]]; then
        case "$pending" in
          examples/checkout-world/services/fraudcheck/fraudcheck.ts) surface='Source fraudcheck.ts' ;;
          examples/checkout-world/services/fraudcheck/fraudcheck.proto) surface='Source fraudcheck.proto' ;;
          *) echo "unexpected path: $pending" >&2; return 95 ;;
        esac
        palette=closed
        return
      fi
      [[ "$palette" == command ]] || return 96
      palette=closed
      case "$pending" in
        'Build repository service topology')
          builds=$((builds + 1))
          if [[ "$builds:$SCENARIO_MODE" != '2:stale' ]]; then epoch=$((epoch + 1)); state=Reconciling; fi
          if (( builds == 2 )); then
            case "$SCENARIO_MODE" in
              fast) state=Consistent ;;
              core-changed) core=2 ;;
              doc-changed) doc=101 ;;
            esac
          fi ;;
        'Open repository path') palette=path; pending="" ;;
        'Show system graphs') : ;; # Independent source selection is retained.
        *) echo "unexpected command: $pending" >&2; return 91 ;;
      esac ;;
  esac
}
swarm_window_wait_title() {
  local mode=present budget=default
  if (( $# >= 2 )); then mode=$2; fi
  if (( $# >= 3 )); then budget=$3; fi
  record "wait|$1|$mode|$budget"
  if [[ "$SCENARIO_FAIL" == "$builds:$1" ]]; then
    echo "injected failure: $SCENARIO_FAIL" >&2
    return 73
  fi
  case "$1" in
    'Palette open')
      if [[ "$mode" == absent ]]; then [[ "$palette" == closed ]] || return 97
      else [[ "$palette" != closed ]] || return 97; fi ;;
    Reconciling) [[ "$state" == Reconciling ]] || return 92 ;;
    Consistent) if (( builds == 1 )); then state=Consistent; fi; [[ "$state" == Consistent ]] || return 93 ;;
    'Topology '*)
      if [[ "$SCENARIO_MODE" != stale ]]; then state=Consistent; fi
      [[ "$1" == "Topology $epoch:green" && "$state" == Consistent ]] || return 74 ;;
    'Source fraudcheck.ts'|'Source fraudcheck.proto'|Graphs) [[ "$surface" == "$1" ]] || return 94 ;;
  esac
}
`;

async function runScenario(failure = "", mode = "delayed") {
  const root = await mkdtemp(join(tmpdir(), "swarm-topology-scenario-"));
  roots.push(root);
  const driverPath = join(root, "driver.sh");
  const log = join(root, "events");
  await writeFile(driverPath, driver);
  await writeFile(log, "");
  const result = spawnSync("bash", [resolve("tools/desktop-topology-scenario.sh")], {
    encoding: "utf8", timeout: 5000,
    env: {
      ...process.env, SWARM_X11_DRIVER_PATH: driverPath, SWARM_ARTIFACT_DIR: join(root, "artifacts"),
      SWARM_WINDOW_ID: "fixture-window", SWARM_WINDOW_PID: "123", SWARM_APP_SESSION: "fixture-session",
      SWARM_RENDERER_PROCESS_ARGUMENT: "fixture-renderer", SCENARIO_LOG: log, SCENARIO_FAIL: failure, SCENARIO_MODE: mode,
    },
  });
  expect(result.error).toBeUndefined();
  return { ...result, events: (await readFile(log, "utf8")).trim().split("\n") };
}

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("desktop topology shell scenario", () => {
  it.each(["delayed", "fast"])("accepts %s incremental completion only at a fresh epoch before source navigation", async (mode) => {
    const result = await runScenario("", mode);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("desktop topology scenario passed");
    expect(result.events.filter((event) => event.startsWith("command|") || /^wait\|(Reconciling|Consistent|Topology [^|]+)\|/.test(event))).toEqual([
      `command|${build}`, "wait|Reconciling|present|default", "wait|Consistent|present|360000",
      `command|${build}`, "wait|Topology 42:green|present|30000",
      "command|Open repository path", `command|${sourcePath}`,
      "command|Open repository path", `command|${contractPath}`, "command|Show system graphs",
    ]);
    for (const [command, title, capture] of [
      [sourcePath, "Source fraudcheck.ts", "fraudcheck-source.png"],
      [contractPath, "Source fraudcheck.proto", "fraudcheck-contract.png"],
      ["Show system graphs", "Source fraudcheck.proto", "returned-to-graphs.png"],
    ]) {
      const commandIndex = result.events.indexOf(`command|${command}`);
      const waitIndex = result.events.indexOf(`wait|${title}|present|default`, commandIndex);
      expect(waitIndex).toBeGreaterThan(commandIndex);
      expect(result.events.indexOf(`capture|${capture}`)).toBeGreaterThan(waitIndex);
    }
    expect(result.events).toContain("wait|FraudCheck visible|present|default");
    expect(result.stdout).toContain("changed_pixels=2000");
  });

  it.each(["1:Reconciling", "1:Consistent", "2:Topology 42:green", "2:FraudCheck visible", "2:Source fraudcheck.ts", "2:Source fraudcheck.proto"])(
    "propagates %s failure without retrying or reporting success", async (failure) => {
      const result = await runScenario(failure);
      expect(result.status, result.stderr).toBe(73);
      expect(result.stderr).toContain(`injected failure: ${failure}`);
      expect(result.stdout).not.toContain("desktop topology scenario passed");
      expect(result.events.filter((event) => event === `command|${build}`)).toHaveLength(Number(failure[0]));
      expect(result.events.at(-1)).toMatch(new RegExp(`^wait\\|${failure.slice(2).replaceAll(".", "\\.")}\\|`));
    },
  );

  it.each(["stale", "core-changed", "doc-changed"])("rejects %s despite a green title and two dispatched builds", async (mode) => {
    const result = await runScenario("", mode);
    expect(result.status, result.stderr).toBe(mode === "stale" ? 74 : 4);
    expect(result.stdout).not.toContain("desktop topology scenario passed");
    expect(result.events.filter((event) => event === `command|${build}`)).toHaveLength(2);
    expect(result.events).toContain("wait|Topology 42:green|present|30000");
    expect(result.events).not.toContain("command|Open repository path");
  });
});
