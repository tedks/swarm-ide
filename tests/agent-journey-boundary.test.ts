// @vitest-environment node
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("test-only journey packaging boundary", () => {
  it("production bundles contain no fixture or test authority", async () => {
    const built = await build({ entryPoints: ["core/worker.ts", "app/electron/main.ts"],
      outdir: "/unused-in-memory-output", bundle: true, write: false, metafile: true,
      platform: "node", format: "cjs", external: ["electron"] });
    expect(Object.keys(built.metafile!.inputs).filter((path) => /^(fixtures|tests)\//.test(path))).toEqual([]);
    const text = built.outputFiles!.map((file) => file.text).join("\n");
    expect(text).not.toContain("fixture.control");
    expect(text).not.toContain("journey.sock");
    expect(text).toContain("ADAPTER_POLICY_UNAVAILABLE");
  });
  it("only the distinct fixture worker bundles E2 and its private controls", async () => {
    const built = await build({ entryPoints: ["tests/support/agent-journey-worker.ts"],
      bundle: true, write: false, metafile: true, platform: "node", format: "cjs", external: ["electron"] });
    const paths = Object.keys(built.metafile!.inputs);
    expect(paths).toContain("fixtures/agents.ts");
    expect(paths).toContain("core/agents/service.ts");
    expect(paths).toContain("core/agents/file-store.ts");
    expect(paths).toContain("core/agents/context.ts");
    expect(paths).not.toContain("core/agents/codex-app-server.ts");
    expect(built.outputFiles![0]!.text).toContain("fixture.control");
  });
  it("normal dev cannot select the test entry or alias with environment", async () => {
    const normalDev = await readFile("tools/dev.mjs", "utf8");
    const productionEntry = await readFile("core/worker.ts", "utf8");
    const launch = await readFile("app/electron/core-launch.ts", "utf8");
    expect(normalDev).not.toMatch(/journey|fixture.control/);
    expect(productionEntry).toContain("startCoreWorker({ createTasks: createDitzTaskProvider });");
    expect(productionEntry).not.toContain("process.env");
    expect(launch).toContain('join(__dirname, "../../core/worker.js")');
    expect(launch).not.toMatch(/journey|fixture/);
  });
});
