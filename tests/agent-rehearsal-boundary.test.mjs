// @vitest-environment node
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseRehearsalArguments, rehearsalHelp } from "../tools/agent-rehearsal/options.mjs";

describe("human rehearsal launch boundary", () => {
  it.each([[], ["--workspace", "/tmp"], ["--interactive-desktop"], ["--interactive-desktop", "--workspace", "relative"],
    ["--interactive-desktop", "--workspace", "/tmp", "--eval", "malicious"],
    ["--interactive-desktop", "--workspace", "/tmp\nspoof"]])("requires an exact deliberate desktop and absolute workspace choice %j", (...args) => {
    expect(() => parseRehearsalArguments(args)).toThrow(/Choose explicitly/);
  });
  it("accepts spaces as literal workspace data, not shell arguments", () => {
    expect(parseRehearsalArguments(["--interactive-desktop", "--workspace", "/a repo/$(literal)"])).toEqual({ mode: "interactive", workspace: "/a repo/$(literal)" });
    expect(parseRehearsalArguments(["--owned-virtual-acceptance", "--workspace", "/repo"])).toEqual({ mode: "owned-acceptance", workspace: "/repo" });
    expect(parseRehearsalArguments(["--help"])).toEqual({ help: true });
    expect(rehearsalHelp).toContain("No arguments opens nothing");
  });
  it("real launcher rejects missing opt-in before Electron/display/profile work", () => {
    try {
      execFileSync(process.execPath, ["tools/agent-rehearsal/launch.mjs"], { env: { ...process.env, DISPLAY: ":0", SWARM_ELECTRON_BIN: "/must-not-be-executed" }, encoding: "utf8", stdio: "pipe", timeout: 10000 });
      throw new Error("Launcher unexpectedly succeeded");
    } catch (error) {
      expect(error.status).toBe(2);
      expect(error.stderr).toContain("No desktop was opened");
      expect(error.stdout).not.toContain("Private profile:");
      expect(error.stderr).not.toContain("must-not-be-executed");
    }
  });
  it("production bundle has no rehearsal authority and stays policy unavailable", async () => {
    const built = await build({ entryPoints: ["core/worker.ts", "app/electron/main.ts"], outdir: "/unused-in-memory", bundle: true,
      platform: "node", format: "cjs", external: ["electron"], write: false, metafile: true });
    expect(Object.keys(built.metafile.inputs).filter((path) => /rehearsal|^tests\//.test(path))).toEqual([]);
    const text = built.outputFiles.map((file) => file.text).join("\n");
    expect(text).toContain("ADAPTER_POLICY_UNAVAILABLE");
    expect(text).not.toContain("swarm-rehearsal-mode");
    expect(text).not.toContain("deterministic-rehearsal");
  });
  it("fixed rehearsal worker includes real context/store but no external adapter or settlement endpoint", async () => {
    const built = await build({ entryPoints: ["tests/support/agent-rehearsal-worker.ts"], bundle: true, platform: "node", format: "cjs",
      external: ["electron"], write: false, metafile: true });
    const paths = Object.keys(built.metafile.inputs);
    for (const path of ["core/worker-runtime.ts", "core/agents/context.ts", "core/agents/service.ts", "core/agents/file-store.ts"]) expect(paths).toContain(path);
    expect(paths).not.toContain("core/agents/codex-app-server.ts");
    expect(paths).not.toContain("fixtures/agents.ts");
    expect(built.outputFiles[0].text).not.toContain("fixture.control");
    expect(built.outputFiles[0].text).toContain("deterministic-rehearsal");
  });
  it("normal launch has no environment selector and human mode has no automatic proof driver", async () => {
    expect(await readFile("tools/dev.mjs", "utf8")).not.toContain("rehearsal");
    const main = await readFile("tests/support/agent-rehearsal-main.ts", "utf8");
    expect(main).toContain('mode !== "owned-acceptance" || attempted');
    expect(main).toContain("test-only-rehearsal-label");
    expect(main).not.toContain("innerHTML");
    expect(await readFile("tools/agent-rehearsal/launch.mjs", "utf8")).not.toContain("rm(profile");
  });
});
