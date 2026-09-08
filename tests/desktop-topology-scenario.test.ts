// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
async function wrapper(proof?: string) {
  const root = await mkdtemp(join(tmpdir(), "swarm-service-smoke-delegation-")); roots.push(root);
  const tools = join(root, "tools"); await mkdir(join(tools, "services"), { recursive: true });
  await writeFile(join(tools, "desktop-smoke.sh"), await readFile(resolve("tools/desktop-smoke.sh")));
  if (proof !== undefined) await writeFile(join(tools, "services/smoke.sh"), proof);
  return join(tools, "desktop-smoke.sh");
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("retired topology smoke entry points", () => {
  it.each([0, 73])("delegates once and preserves proof exit status %s, evidence settings, and arguments", async (status) => {
    const script = await wrapper('printf "proof|%s|%s|%s\\n" "$SWARM_ARTIFACT_DIR" "$1" "$2"\nexit "$PROOF_STATUS"\n');
    const result = spawnSync("bash", [script, "first argument", "second"], { encoding: "utf8", timeout: 5000,
      env: { ...process.env, SWARM_ARTIFACT_DIR: "/fixture/evidence", PROOF_STATUS: String(status) } });
    expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(status);
    expect(result.stdout).toBe("proof|/fixture/evidence|first argument|second\n");
  });
  it("fails clearly instead of passing when the replacement proof is missing", async () => {
    const result = spawnSync("bash", [await wrapper()], { encoding: "utf8", timeout: 5000 });
    expect(result.status).toBe(2); expect(result.stderr).toContain("//tools/services:smoke");
    expect(result.stdout).toBe("");
  });
  it("rejects direct invocation of the retired scenario before touching a desktop", () => {
    const result = spawnSync("bash", [resolve("tools/desktop-topology-scenario.sh")], { encoding: "utf8", timeout: 5000 });
    expect(result.status).toBe(2); expect(result.stderr).toContain("Retired topology scenario");
    expect(result.stderr).toContain("//tools/services:smoke"); expect(result.stdout).toBe("");
  });
});
