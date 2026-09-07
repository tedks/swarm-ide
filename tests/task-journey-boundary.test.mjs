// @vitest-environment node
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { advanceUnrelatedTaskFixture, createTaskFixture } from "../tools/task-integration/fixture.mjs";

describe("D6 real task journey boundaries", () => {
  it("observes transport without modifying payloads, transfer lists, return values or bounds", async () => {
    const sent = [], launched = [], sentinel = {}, child = { postMessage(...args) { sent.push(args); return sentinel; } };
    const utilityProcess = { fork(...args) { launched.push(args); return child; } };
    const module = { exports: {} };
    runInNewContext(await readFile("tools/task-integration/observe-transport.cjs", "utf8"), {
      require(name) { expect(name).toBe("electron"); return { utilityProcess }; }, module,
    });
    const options = {}, process = utilityProcess.fork("/fixed/core", [], options);
    expect(process).toBe(child); expect(launched[0][2]).toBe(options);
    const input = { type: "agent.prepare", requestId: "proof", privateBody: "not recorded" }, transfer = [];
    expect(child.postMessage(input, transfer)).toBe(sentinel);
    expect(sent[0][0]).toBe(input); expect(sent[0][1]).toBe(transfer);
    const first = module.exports();
    expect(JSON.parse(JSON.stringify(first))).toEqual({ generations: 1, overflow: false, requests: [{ type: "agent.prepare", requestId: "proof" }] });
    first.requests.length = 0; expect(module.exports().requests).toHaveLength(1);
    for (let index = 0; index < 4096; index++) child.postMessage({ type: "agent.snapshot", requestId: String(index) });
    expect(module.exports().requests).toHaveLength(4096); expect(module.exports().overflow).toBe(true);
    expect(sent).toHaveLength(4097);
  });
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
