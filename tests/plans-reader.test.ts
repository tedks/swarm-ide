// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readPlanIndex } from "../core/plans";
import { PLAN_INDEX_PATH, PLAN_LIMITS, PLAN_READ_MESSAGES, PlanIndexSchema, PlanReadResultSchema, type PlanIndex, type PlanNode } from "../protocol/plans";

const roots: string[] = [];
async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "swarm-plans-reader-")); roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "fixture"], { cwd: root });
  return root;
}
async function put(root: string, content: string | Buffer): Promise<void> {
  await mkdir(join(root, ".swarm"), { recursive: true });
  await writeFile(join(root, PLAN_INDEX_PATH), content);
}
const node = (id: string, parentId: string | null = null): PlanNode => ({
  id, parentId, kind: "plan", title: `Plan ${id}`, docs: [], sourcePaths: [], taskIds: [], contextRefs: [],
});
const index = (...nodes: PlanNode[]): PlanIndex => ({ version: 1, nodes });
const unavailable = (code: keyof typeof PLAN_READ_MESSAGES) => ({ status: "unavailable", code, message: PLAN_READ_MESSAGES[code] });
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("authored plan index contract", () => {
  it("accepts empty or explicitly rooted forests and never infers ancestry from namespaces or paths", () => {
    const authored = index(node("root:child"), node("root"), node("component", "root"));
    expect(PlanIndexSchema.parse(authored)).toEqual(authored);
    expect(PlanIndexSchema.parse(index())).toEqual(index());
    const chain = Array.from({ length: PLAN_LIMITS.nodes }, (_, i) => node(`p${i}`, i ? `p${i - 1}` : null));
    expect(PlanIndexSchema.parse(index(...chain)).nodes).toHaveLength(PLAN_LIMITS.nodes);
  });

  it.each([
    ["duplicate IDs", index(node("same"), node("same"))],
    ["absent parent", index(node("child", "missing"))],
    ["self cycle", index(node("cycle", "cycle"))],
    ["multi-node cycle", index(node("a", "b"), node("b", "c"), node("c", "a"))],
    ["a valid root beside a cycle", index(node("root"), node("a", "b"), node("b", "a"))],
    ["implicit parent", { version: 1, nodes: [{ ...node("a"), parentId: undefined }] }],
    ["unknown top-level key", { ...index(), inferred: true }],
    ["unknown node key", index({ ...node("a"), inferred: true } as PlanNode)],
    ["wrong version", { ...index(), version: 2 }],
    ["unsupported kind", index({ ...node("a"), kind: "task" } as unknown as PlanNode)],
    ["blank title", index({ ...node("a"), title: "  " })],
    ["invalid Unicode", index({ ...node("a"), title: "\ud800" })],
    ["too many nodes", index(...Array.from({ length: PLAN_LIMITS.nodes + 1 }, (_, i) => node(`p${i}`)))],
  ])("rejects %s", (_name, value) => {
    expect(PlanIndexSchema.safeParse(value).success).toBe(false);
  });

  it.each(["", "has space", "a::b", ":a", "a:", "a/b", "a.b", "é", "a".repeat(PLAN_LIMITS.idBytes + 1)])("rejects unstable ID syntax %j", (id) => {
    expect(PlanIndexSchema.safeParse(index(node(id))).success).toBe(false);
  });

  it.each(["/etc/passwd", "../private", "docs/../private", "./doc", "docs//plan", "docs/", "C:/private", "docs\\plan", "bad\0path", "bad\u202epath"])("rejects unsafe reference path %j in every field", (path) => {
    for (const refs of [{ docs: [path] }, { sourcePaths: [path] }, { contextRefs: [{ kind: "doctrine", path, note: null }] }]) {
      expect(PlanIndexSchema.safeParse(index({ ...node("a"), ...refs } as PlanNode)).success).toBe(false);
    }
  });

  it("bounds each list and UTF-8 text, shares task IDs and keeps context references strict", () => {
    for (const refs of [
      { taskIds: Array(PLAN_LIMITS.taskIdsPerNode + 1).fill("task") },
      { taskIds: ["task:unsupported"] },
      { contextRefs: Array(PLAN_LIMITS.contextRefsPerNode + 1).fill({ kind: "lesson", path: "docs/a.md", note: null }) },
      { contextRefs: [{ kind: "automatic", path: "docs/a.md", note: null }] },
      { contextRefs: [{ kind: "contract", path: "docs/a.md", note: null, instruction: "run" }] },
      { contextRefs: [{ kind: "contract", path: "docs/a.md", note: "é".repeat(PLAN_LIMITS.noteBytes) }] },
      { docs: ["é".repeat(PLAN_LIMITS.pathBytes)] },
      { title: "é".repeat(PLAN_LIMITS.titleBytes) },
    ]) expect(PlanIndexSchema.safeParse(index({ ...node("a"), ...refs } as PlanNode)).success).toBe(false);
  });

  it("rejects a serialized index over the byte ceiling even when all individual fields fit", () => {
    const nodes = Array.from({ length: PLAN_LIMITS.nodes }, (_, i) => ({ ...node(`p${i}`),
      contextRefs: [{ kind: "lesson" as const, path: "docs/a.md", note: "a".repeat(PLAN_LIMITS.noteBytes) }] }));
    expect(PlanIndexSchema.safeParse(index(...nodes)).success).toBe(false);
  });

  it("preserves large component reference lists instead of imposing a presentation limit on data", () => {
    const sourcePaths = Array.from({ length: 300 }, (_, i) => `core/source-${i}.ts`);
    const authored = index({ ...node("component"), sourcePaths, docs: sourcePaths });
    expect(PlanIndexSchema.parse(authored)).toEqual(authored);
    expect(PlanIndexSchema.safeParse(index({ ...node("component"), sourcePaths: Array(8000).fill("core/long-source-name.ts") })).success).toBe(false);
  });

  it("requires exact safe diagnostics and bounded observed provenance", () => {
    for (const code of Object.keys(PLAN_READ_MESSAGES) as (keyof typeof PLAN_READ_MESSAGES)[]) {
      expect(PlanReadResultSchema.parse(unavailable(code))).toEqual(unavailable(code));
      expect(PlanReadResultSchema.safeParse({ ...unavailable(code), message: "private OS parser output" }).success).toBe(false);
    }
    expect(PlanReadResultSchema.safeParse({ ...unavailable("PLAN_INDEX_UNAVAILABLE"), message: PLAN_READ_MESSAGES.PLAN_INDEX_MALFORMED }).success).toBe(false);
    const observed = { status: "observed", index: index(), revision: "a".repeat(64), observedAt: new Date().toISOString() };
    expect(PlanReadResultSchema.parse(observed)).toEqual(observed);
    expect(PlanReadResultSchema.safeParse({ ...observed, revision: "a".repeat(40) }).success).toBe(false);
    expect(PlanReadResultSchema.safeParse({ ...observed, observedAt: "yesterday" }).success).toBe(false);
    expect(PlanReadResultSchema.safeParse({ ...unavailable("PLAN_INDEX_UNAVAILABLE"), index: index() }).success).toBe(false);
  });
});

describe("contained authored plan index reader", () => {
  it("loads the actual committed plan without losing any design source links", async () => {
    const committedRoot = resolve(import.meta.dirname, "..");
    const authored = JSON.parse(await readFile(join(committedRoot, PLAN_INDEX_PATH), "utf8"));
    const result = await readPlanIndex(committedRoot);
    expect(result.status).toBe("observed");
    if (result.status !== "observed") throw new Error(result.code);
    expect(result.index).toEqual(authored);
    expect(result.index.nodes.find((entry) => entry.id === "design:repository")!.sourcePaths.length).toBeGreaterThan(16);
  });

  it("reads only the fixed index and preserves raw-byte provenance and literal references", async () => {
    const root = await repository();
    const authored = index(node("plan:root"), { ...node("component:core", "plan:root"), kind: "component",
      docs: ["docs/not-created.md"], sourcePaths: ["core/not-created.ts"], taskIds: ["task-1"],
      contextRefs: ["doctrine", "contract", "lesson"].map((kind) => ({ kind, path: "docs/context.md", note: "Literal <script> text" })) as PlanNode["contextRefs"] });
    const raw = `\n${JSON.stringify(authored, null, 2)}\n`;
    await writeFile(join(root, "plans.json"), "ignored");
    await put(root, raw);
    const before = Date.now();
    const result = await readPlanIndex(root);
    expect(PlanReadResultSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({ status: "observed", index: authored, revision: createHash("sha256").update(raw).digest("hex") });
    if (result.status !== "observed") throw new Error("Expected observed fixture");
    expect(Date.parse(result.observedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(result.observedAt)).toBeLessThanOrEqual(Date.now());
    await put(root, JSON.stringify(authored));
    const compact = await readPlanIndex(root);
    expect(compact).toMatchObject({ status: "observed", index: authored });
    if (compact.status !== "observed") throw new Error("Expected observed compact fixture");
    expect(compact.revision).not.toBe(result.revision);
  });

  it("does not fabricate an index when missing and sanitizes private-path read failures", async () => {
    const root = await repository();
    await writeFile(join(root, "plans.json"), JSON.stringify(index(node("ignored"))));
    expect(await readPlanIndex(root)).toEqual({ ...unavailable("PLAN_INDEX_UNAVAILABLE"), missing: true });
    const result = await readPlanIndex(join(root, "private-unavailable-directory"));
    expect(result).toEqual(unavailable("PLAN_INDEX_UNAVAILABLE"));
    expect(JSON.stringify(result)).not.toContain(root);
    expect(JSON.stringify(result)).not.toContain("private-unavailable-directory");
  });

  it.each([
    ["malformed JSON", Buffer.from('{"private-parser-context":')],
    ["fatal UTF-8", Buffer.from(JSON.stringify(index(node("a"))).replace("Plan a", "Plan \xff"), "latin1")],
    ["escaped invalid Unicode", Buffer.from(JSON.stringify(index({ ...node("a"), title: "\ud800" })))],
    ["duplicate IDs", Buffer.from(JSON.stringify(index(node("duplicate"), node("duplicate"))))],
    ["missing parent", Buffer.from(JSON.stringify(index(node("child", "missing"))))],
    ["cyclic hierarchy", Buffer.from(JSON.stringify(index(node("a", "b"), node("b", "a"))))],
    ["unsafe path", Buffer.from(JSON.stringify(index({ ...node("a"), docs: ["../private"] })))],
    ["node count", Buffer.from(JSON.stringify(index(...Array.from({ length: PLAN_LIMITS.nodes + 1 }, (_, i) => node(`p${i}`)))))],
  ])("returns safe malformed state for %s", async (_name, bytes) => {
    const root = await repository(); await put(root, bytes);
    expect(await readPlanIndex(root)).toEqual(unavailable("PLAN_INDEX_MALFORMED"));
  });

  it("accepts exactly 64 KiB raw bytes and rejects even whitespace beyond the ceiling", async () => {
    const root = await repository();
    const json = JSON.stringify(index());
    const exact = json + " ".repeat(PLAN_LIMITS.indexBytes - Buffer.byteLength(json));
    await put(root, exact);
    expect(await readPlanIndex(root)).toMatchObject({ status: "observed", revision: createHash("sha256").update(exact).digest("hex") });
    await put(root, exact + " ");
    expect(await readPlanIndex(root)).toEqual(unavailable("PLAN_INDEX_LIMIT_EXCEEDED"));
  });

  it("rejects final symlinks to contained and outside files", async () => {
    const root = await repository(); const outside = await repository();
    await mkdir(join(root, ".swarm"));
    for (const target of [join(root, "other.json"), join(outside, "private.json")]) {
      await writeFile(target, JSON.stringify(index(node("hidden"))));
      await symlink(target, join(root, PLAN_INDEX_PATH));
      expect(await readPlanIndex(root)).toEqual(unavailable("PLAN_INDEX_UNAVAILABLE"));
      await rm(join(root, PLAN_INDEX_PATH));
    }
  });

  it("rejects symlinked index directories, including aliases remaining inside the workspace", async () => {
    const root = await repository(); const outside = await repository();
    await mkdir(join(root, "alias"));
    for (const target of [join(root, "alias"), outside]) {
      await writeFile(join(target, "plans.json"), JSON.stringify(index(node("hidden"))));
      await symlink(target, join(root, ".swarm"));
      expect(await readPlanIndex(root)).toEqual(unavailable("PLAN_INDEX_UNAVAILABLE"));
      await rm(join(root, ".swarm"));
    }
  });

  it("rejects an index inside a nested repository marker", async () => {
    const root = await repository(); await put(root, JSON.stringify(index(node("hidden"))));
    await mkdir(join(root, ".swarm", ".git"));
    expect(await readPlanIndex(root)).toEqual(unavailable("PLAN_INDEX_UNAVAILABLE"));
  });

  it("rejects directories and FIFO input without waiting for a writer", async () => {
    const root = await repository(); await mkdir(join(root, PLAN_INDEX_PATH), { recursive: true });
    expect(await readPlanIndex(root)).toEqual(unavailable("PLAN_INDEX_UNAVAILABLE"));
    await rm(join(root, PLAN_INDEX_PATH), { recursive: true });
    execFileSync("mkfifo", [join(root, PLAN_INDEX_PATH)]);
    expect(await readPlanIndex(root)).toEqual(unavailable("PLAN_INDEX_UNAVAILABLE"));
  }, 5_000);
});
