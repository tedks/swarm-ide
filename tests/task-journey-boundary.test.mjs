// @vitest-environment node
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { advanceUnrelatedTaskFixture, createTaskFixture } from "../tools/task-integration/fixture.mjs";

describe("D6 real task journey boundaries", () => {
  it("unrelated CLI edit advances full metadata pin without changing primary blob or source", async () => {
    const owned = await mkdtemp(join(tmpdir(), "task-journey-boundary-"));
    try {
      const fixture = await createTaskFixture(owned);
      const git = (...args) => execFileSync("git", ["-C", fixture.root, ...args], { encoding: "utf8", timeout: 5000 }).trim();
      const blob = git("rev-parse", `${fixture.firstCommit.hex}:.ditz/issue-${fixture.taskId}.yaml`);
      const before = git("status", "--porcelain");
      const advanced = await advanceUnrelatedTaskFixture(fixture);
      expect(advanced).not.toEqual(fixture.firstCommit);
      expect(git("diff-tree", "--no-commit-id", "--name-only", "-r", advanced.hex)).toBe(`.ditz/issue-${fixture.secondId}.yaml`);
      expect(git("rev-parse", `${advanced.hex}:.ditz/issue-${fixture.taskId}.yaml`)).toBe(blob);
      expect(fixture.description).toContain('réponse 🧪 "quoted"');
      expect(await readFile(join(fixture.root, fixture.sourcePath), "utf8")).toBe(fixture.sourceText);
      expect(git("status", "--porcelain")).toBe(before);
    } finally { await rm(owned, { recursive: true, force: true }); }
  }, 30000);

  it("fixed rehearsal worker joins the real Tasks reader and task resolver, not a metadata fixture", async () => {
    const result = await build({ entryPoints: ["tests/support/agent-rehearsal-worker.ts"], bundle: true,
      platform: "node", format: "cjs", external: ["electron"], write: false, metafile: true });
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs).toContain("core/tasks/provider.ts");
    expect(inputs).toContain("core/tasks/draft-context.ts");
    expect(inputs).toContain("core/tasks/git-reader.ts");
    expect(inputs).not.toContain("core/agents/codex-app-server.ts");
    expect(inputs).not.toContain("fixtures/agents.ts");
    expect(result.outputFiles[0].text).not.toContain("fixture.control");
  });
});
