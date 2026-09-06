// @vitest-environment node
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRehearsalArguments, rehearsalHelp } from "../tools/agent-rehearsal/options.mjs";

describe("human rehearsal launch boundary", () => {
  it("each actual smoke invocation ignores stale success and failure evidence", async () => {
    const owned = await mkdtemp(join(tmpdir(), "rehearsal-launch-test-"));
    try {
      const tools = join(owned, "tools"); const scripts = join(tools, "agent-rehearsal"); const artifacts = join(owned, "evidence");
      await mkdir(scripts, { recursive: true }); await mkdir(artifacts);
      await copyFile("tools/agent-rehearsal/smoke.sh", join(scripts, "smoke.sh"));
      // Fixed inert stand-in at the script's actual relative harness path. It
      // records only the fresh path; no display, provider or process is opened.
      await writeFile(join(tools, "virtual-desktop-run.sh"), '#!/bin/sh\nprintf "%s\\n" "$SWARM_REHEARSAL_ARTIFACTS"\n', { mode: 0o700 });
      await writeFile(join(artifacts, "rehearsal.json"), '{"ok":true}');
      await writeFile(join(artifacts, "rehearsal-failure.json"), '{"error":"old"}');
      const run = () => execFileSync("bash", [join(scripts, "smoke.sh")], { env: { ...process.env, SWARM_ARTIFACT_DIR: artifacts }, encoding: "utf8", timeout: 5000 }).trim();
      const first = run(), second = run();
      expect(first).not.toBe(second); expect(first.startsWith(artifacts + "/run.")).toBe(true);
      expect(await readdir(first)).toEqual([]); expect(await readdir(second)).toEqual([]);
      expect(await readFile(join(artifacts, "rehearsal.json"), "utf8")).toBe('{"ok":true}');
    } finally { await rm(owned, { recursive: true, force: true }); }
  });
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
