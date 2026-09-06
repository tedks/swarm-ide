// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerOptions } from "node:worker_threads";
import { stringify } from "yaml";
import { parseTaskMetadata, type TaskMetadataInput } from "../core/tasks/metadata";
import { TASK_LIMITS, TaskDetailSchema, type GitObjectId } from "../protocol/tasks";

// Observe real worker lifetimes; neither YAML nor the worker program is mocked.
const workerEvidence = vi.hoisted(() => ({ workers: [] as { threadId: number; once: (event: string, fn: () => void) => unknown }[] }));
vi.mock("node:worker_threads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:worker_threads")>();
  return { ...actual, Worker: class extends actual.Worker {
    constructor(filename: string | URL, options?: WorkerOptions) {
      super(filename, options); workerEvidence.workers.push(this);
    }
  } };
});
const blob: GitObjectId = { algorithm: "sha1", hex: "a".repeat(40) };
const project = { name: "fixture", version: "0.1.0", components: [{ name: "core" }], releases: [] };
const issue = (name = "alpha", overrides: Record<string, unknown> = {}) => ({
  id: name, title: "Read actual tasks", desc: "Literal <script> text and docs/readme.md are not links",
  type: "feature", component: "core", status: "unstarted", disposition: null, ...overrides,
});
const entry = (id: string | null, text: string | Uint8Array): TaskMetadataInput => ({
  id, blob: { ...blob }, bytes: typeof text === "string" ? Buffer.from(text, "utf8") : text,
});
const input = (text = stringify(issue())) => [entry(null, stringify(project)), entry("alpha", text)];
const parse = (values: TaskMetadataInput[]) => parseTaskMetadata(values, new AbortController().signal, Date.now() + 10_000);
afterEach(() => {
  expect(workerEvidence.workers.every((worker) => worker.threadId === -1)).toBe(true);
  workerEvidence.workers.length = 0;
});

describe("bounded real YAML task metadata worker", () => {
  it("projects the actual fields only, treats absent arrays as empty, and awaits the single worker exit", async () => {
    const details = await parse(input(stringify(issue("alpha", { references: ["src/secret.ts"], people: ["ignored"], log_events: [] }))));
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({ id: "alpha", blob, type: "feature", status: "unstarted",
      counts: { blocks: 0, blockedBy: 0, fileRefs: 0 }, fileRefs: [], blocks: [], blockedBy: [] });
    expect(details[0]).not.toHaveProperty("references");
    expect(details[0]).not.toHaveProperty("people");
    expect(TaskDetailSchema.safeParse(details[0]).success).toBe(true);
    expect(workerEvidence.workers).toHaveLength(1);
  });
  it("requires project metadata and accepts its valid zero-task snapshot", async () => {
    await expect(parse([entry(null, stringify(project))])).resolves.toEqual([]);
    await expect(parse([])).rejects.toMatchObject({ code: "TASK_METADATA_MALFORMED" });
    for (const invalid of [{}, { ...project, version: 1 }, { ...project, components: ["core"] },
      { ...project, components: [{ name: "core" }, { name: "core" }] }, { ...project, releases: "none" },
      { ...project, releases: [{}] }, { ...project, releases: [{ name: "v1", status: "next", release_time: null, log_events: [] }] }]) {
      await expect(parse([entry(null, stringify(invalid))])).rejects.toMatchObject({ code: "TASK_METADATA_MALFORMED" });
    }
  });
  it("validates meaningful project release records while omitting private log data", async () => {
    const value = { ...project, releases: [{ name: "v1", status: "released", release_time: "2026-09-06",
      log_events: [{ time: "2026-09-06", who: "private", what: "released", comment: "private" }] }] };
    await expect(parse([entry(null, stringify(value))])).resolves.toEqual([]);
  });
  it("captures input IDs and bytes before awaiting the worker", async () => {
    const values = input();
    const task = parse(values);
    values[1]!.id = "mutated"; values[1]!.blob.hex = "f".repeat(40); values[1]!.bytes.fill(0);
    const [detail] = await task;
    expect(detail!.id).toBe("alpha");
    expect(detail!.blob.hex).toBe("a".repeat(40));
  });
  it("retains unsupported literal file references without interpreting prose or opening sources", async () => {
    const paths = ["docs/design.md", "src/example.ts", "../outside", "/absolute", "https://example.com/x", "a\\b", "a//b", "a/./b", "a\nb", ""];
    const [detail] = await parse(input(stringify(issue("alpha", { file_refs: paths.map((path) => ({ path, line: null, note: null })) }))));
    expect(detail!.fileRefs.map((ref) => ref.path)).toEqual(paths);
    expect(detail!.fileRefs.map((ref) => ref.navigation)).toEqual(["candidate", "candidate", ...paths.slice(2).map(() => "unsupported")]);
  });
  it("keeps full SHA-256 blob identity and stable full-ID ordering", async () => {
    const values = [entry(null, stringify(project)), entry("zeta", stringify(issue("zeta"))), entry("alpha", stringify(issue()))];
    values.forEach((value) => { value.blob = { algorithm: "sha256", hex: "b".repeat(64) }; });
    const details = await parse(values);
    expect(details.map((detail) => detail.id)).toEqual(["alpha", "zeta"]);
    expect(details.every((detail) => detail.blob.algorithm === "sha256")).toBe(true);
  });
  it("reports literal missing, cyclic and asymmetric dependencies from both recorded directions", async () => {
    const values = [entry(null, stringify(project)),
      entry("alpha", stringify(issue("alpha", { blocks: ["beta", "missing"], blocked_by: ["gamma"] }))),
      entry("beta", stringify(issue("beta", { blocks: ["gamma"], blocked_by: ["alpha"], status: "closed" }))),
      entry("gamma", stringify(issue("gamma", { blocks: ["alpha"] }))),
    ];
    const [alpha, beta, gamma] = await parse(values);
    expect(alpha!.blocks).toEqual([{ taskId: "beta", status: "closed", diagnostics: ["cyclic"] },
      { taskId: "missing", status: null, diagnostics: ["missing"] }]);
    expect(beta!.blocks).toEqual([{ taskId: "gamma", status: "unstarted", diagnostics: ["cyclic", "asymmetric"] }]);
    expect(gamma!.blockedBy).toEqual([]); // diagnostics do not repair the one-sided record.
  });
  it("marks a self dependency cyclic without inferring task readiness", async () => {
    const [detail] = await parse(input(stringify(issue("alpha", { blocked_by: ["alpha"] }))));
    expect(detail!.blockedBy[0]).toEqual({ taskId: "alpha", status: "unstarted", diagnostics: ["cyclic", "asymmetric"] });
  });
  it.each([
    "title: replacement\n", "extra: &a {hello: world}\nother: *a\n", "extra: !!str value\n",
    "extra: !unknown value\n", "extra: {<<: {x: y}}\n", "extra: {__proto__: value}\n",
    "extra: {constructor: value}\n", "extra: {prototype: value}\n", "extra: {1: value}\n",
    "extra: {? [a, b]: value}\n", "extra: {duplicate: first, duplicate: last}\n",
    "extra: [unterminated\n", "---\nextra: second\n", "extra: \"\\uD800\"\n", "extra: .inf\n",
    "<<<<<<< HEAD\nextra: merge conflict\n=======\nextra: other\n>>>>>>> branch\n",
  ])("rejects hostile YAML syntax without exposing contents: %s", async (suffix) => {
    await expect(parse(input(stringify(issue()) + suffix))).rejects.toMatchObject({ code: "TASK_METADATA_MALFORMED" });
  });
  it("rejects invalid UTF-8 instead of accepting replacement characters", async () => {
    const values = input();
    values[1] = entry("alpha", Buffer.concat([Buffer.from(stringify(issue())), Buffer.from([0xff, 0xc0, 0x80])]));
    await expect(parse(values)).rejects.toMatchObject({ code: "TASK_METADATA_MALFORMED" });
  });
  it.each([
    { id: "other" }, { type: "epic" }, { status: "ready" }, { desc: 5 }, { disposition: false },
    { title: "" }, { component: null }, { blocks: null }, { blocks: ["alpha", "alpha"] },
    { blocked_by: ["not an ID"] }, { file_refs: [{ path: "a.ts", line: 0, note: null }] },
    { file_refs: [{ path: "a.ts", line: 1.5, note: null }] },
    { file_refs: [{ path: "a.ts", line: Number.MAX_SAFE_INTEGER + 1, note: null }] },
    { file_refs: [{ path: "a.ts", line: null }] },
  ])("rejects malformed projected field shapes: %j", async (override) => {
    await expect(parse(input(stringify(issue("alpha", override))))).rejects.toMatchObject({ code: "TASK_METADATA_MALFORMED" });
  });
  it.each([
    { title: "é".repeat(257) }, { component: "é".repeat(129) }, { desc: "x".repeat(TASK_LIMITS.descriptionBytes + 1) },
    { disposition: "x".repeat(257) }, { blocks: Array.from({ length: 33 }, (_, i) => `task-${i}`) },
    { blocked_by: Array.from({ length: 33 }, (_, i) => `task-${i}`) },
    { file_refs: Array.from({ length: 33 }, () => ({ path: "a.ts", line: null, note: null })) },
    { file_refs: [{ path: "x".repeat(1025), line: null, note: null }] },
    { file_refs: [{ path: "a.ts", line: null, note: "é".repeat(257) }] },
  ])("classifies field byte/count ceiling %# as limited, never truncated", async (override) => {
    await expect(parse(input(stringify(issue("alpha", override))))).rejects.toMatchObject({ code: "TASK_LIMIT_EXCEEDED" });
  });
  it("enforces blob, aggregate input, issue roster, AST depth and node ceilings", async () => {
    await expect(parse(input("x".repeat(TASK_LIMITS.blobBytes + 1)))).rejects.toMatchObject({ code: "TASK_LIMIT_EXCEEDED" });
    const values = Array.from({ length: 257 }, (_, index) => entry(index === 0 ? null : `task-${index}`, Buffer.alloc(TASK_LIMITS.blobBytes)));
    await expect(parse(values)).rejects.toMatchObject({ code: "TASK_LIMIT_EXCEEDED" });
    await expect(parse([...values, entry("extra", "id: extra")])).rejects.toMatchObject({ code: "TASK_LIMIT_EXCEEDED" });
    await expect(parse(input(stringify(issue()) + `extra: ${"[".repeat(20)}0${"]".repeat(20)}\n`)))
      .rejects.toMatchObject({ code: "TASK_LIMIT_EXCEEDED" });
    await expect(parse(input(stringify(issue()) + `extra: [${Array.from({ length: 8192 }, () => "0").join(",")}]\n`)))
      .rejects.toMatchObject({ code: "TASK_LIMIT_EXCEEDED" });
  });
  it("bounds the serialized detail including escaping overhead", async () => {
    const value = issue("alpha", { file_refs: Array.from({ length: 32 }, () => ({
      path: '"'.repeat(1024), line: null, note: '"'.repeat(512),
    })) });
    const text = stringify(value);
    expect(Buffer.byteLength(text)).toBeLessThan(TASK_LIMITS.blobBytes);
    await expect(parse(input(text))).rejects.toMatchObject({ code: "TASK_LIMIT_EXCEEDED" });
  });
  it("rejects duplicate full IDs and missing/multiple project entries", async () => {
    await expect(parse([...input(), entry("alpha", stringify(issue()))])).rejects.toMatchObject({ code: "TASK_METADATA_MALFORMED" });
    await expect(parse([...input(), entry(null, stringify(project))])).rejects.toMatchObject({ code: "TASK_METADATA_MALFORMED" });
    await expect(parse(input().slice(1))).rejects.toMatchObject({ code: "TASK_METADATA_MALFORMED" });
  });
  it("terminates an actual worker on abort and rejects only after its thread is gone", async () => {
    const controller = new AbortController();
    const task = parseTaskMetadata(input(), controller.signal, Date.now() + 10_000);
    const worker = workerEvidence.workers.at(-1)!;
    worker.once("online", () => controller.abort());
    await expect(task).rejects.toMatchObject({ code: "TASK_OBSERVATION_FAILED" });
    expect(worker.threadId).toBe(-1);
  });
  it("enforces a deadline independently of pathological synchronous YAML parsing", async () => {
    const before = Date.now();
    const text = stringify(issue()) + `extra: ${"[".repeat(30_000)}0${"]".repeat(30_000)}\n`;
    await expect(parseTaskMetadata(input(text), new AbortController().signal, before + 25))
      .rejects.toMatchObject({ code: "TASK_OBSERVATION_FAILED" });
    expect(Date.now() - before).toBeLessThan(2500);
    expect(workerEvidence.workers).toHaveLength(1);
    expect(workerEvidence.workers[0]!.threadId).toBe(-1);
  });
  it("does not create a worker for an already aborted or expired request", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(parseTaskMetadata(input(), controller.signal, Date.now() + 10_000)).rejects.toMatchObject({ code: "TASK_OBSERVATION_FAILED" });
    await expect(parseTaskMetadata(input(), new AbortController().signal, Date.now() - 1)).rejects.toMatchObject({ code: "TASK_OBSERVATION_FAILED" });
    expect(workerEvidence.workers).toHaveLength(0);
  });
});
