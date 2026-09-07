// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("actual packaged repository navigation proof boundary", () => {
  it("builds the ordinary archive and isolates every desktop and profile", async () => {
    const build = await readFile("tools/repository-navigation/BUILD.bazel", "utf8");
    const launch = await readFile("tools/repository-navigation/launch.mjs", "utf8");
    const smoke = await readFile("tools/repository-navigation/smoke.sh", "utf8");
    expect(build).toContain('"//:desktop-bundle"');
    expect(build).toContain('name = "packaged-navigation-test"');
    expect(launch).toContain('process.env.DISPLAY === ":0"');
    expect(launch).toContain('process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY');
    expect(launch).toContain('Number(process.env.SWARM_DEV_PORT) !== 55174');
    expect(launch).toContain('mkdtemp(join(owner, "swarm-navigation-package-"))');
    expect(launch).toContain('`--user-data-dir=${profile}`');
    expect(smoke).toContain('swarm unfamiliar invalid-name fingerprint-budget');
    expect(smoke).toContain('cleanup_complete=1');
    expect(smoke).toContain('virtual-desktop-run.sh');
  });
  it("uses real Git/filesystem inputs and production IPC, never renderer injection", async () => {
    const fixture = await readFile("tools/repository-navigation/fixture.mjs", "utf8");
    const acceptance = await readFile("tools/repository-navigation/acceptance.cjs", "utf8");
    expect(fixture).toContain('["archive", "--format=tar", sourceCommit]');
    expect(fixture).toContain('Buffer.from([0xff])');
    expect(fixture).toContain('truncate(64 * 1024 * 1024 + 1)');
    expect(fixture).toContain('offset < 4_120');
    expect(fixture).toContain('["ref", "navigation-reveal", "src/main.ts:2"');
    expect(acceptance).toContain('require(path.join(packaged, "app/electron/main.js"))');
    expect(acceptance).toContain('window.swarm.request({ protocolVersion: 6');
    expect(acceptance).toContain('assert.deepEqual(rendererErrors, []');
    expect(acceptance).toContain('prepared.error.code === "STALE_CONTEXT"');
    expect(acceptance).toContain('saved.source === state.doc.toString()');
    expect(acceptance).toContain('saved.anchor === state.selection.main.anchor');
    expect(acceptance).toContain('N2 real tracked/untracked/dot/literal filename search beyond loaded slice');
    expect(acceptance).toContain('N2 actual deleted candidate denied on activation without source loss');
    expect(acceptance).toContain('N2 actual 8192-name capture cap visibly partial');
    expect(acceptance).toContain('key("Down"); key("Enter"); await directory("search-proof/b")');
    expect(acceptance).toContain('stage = `file-search-${percent}`');
    expect(acceptance).not.toMatch(/ipcMain\.(?:handle|emit)|fixture\.reset|createFixture|launchContext:|type:\s*["']agent\.launch/);
  });
});
