// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { discoverProjectCatalog } from "../core/project-context/catalog";
import { ProjectCatalogSchema } from "../protocol/project-context";

let scratch: string, root: string;
beforeEach(async () => { scratch = await mkdtemp(join(tmpdir(), "swarm-catalog-")); root = join(scratch, "project"); await mkdir(root); });
afterEach(async () => { await rm(scratch, { recursive: true, force: true }); });
async function put(path: string, text: string | object, base = root) {
  const file = join(base, path); await mkdir(dirname(file), { recursive: true });
  await writeFile(file, typeof text === "string" ? text : JSON.stringify(text));
}
const scan = (path = root) => discoverProjectCatalog(path, new AbortController().signal);

describe("inert project manifest catalog", () => {
  it("finds nested Node components, frameworks, names-only workflows and exact local relationships", async () => {
    await put("package.json", { name: "workspace", workspaces: ["apps/*", "packages/**"], scripts: { dev: "DO_NOT_EXECUTE", "release:build": "secret-command", "test:e2e": "secret-test", deploy: "private-token" } });
    await put("apps/web/package.json", { name: "@example/web", dependencies: { "@example/core": "workspace:*", react: "19", vite: "8", external: "https://user:private-token@registry.test/archive" } });
    await put("packages/core/package.json", { name: "@example/core", devDependencies: { vitest: "5" } });
    await put("services/worker/package.json", { name: "worker", dependencies: { "@example/core": "file:../../packages/core" } });
    const result = await scan(); expect(result.scan.status).toBe("observed");
    expect(result.components).toHaveLength(4);
    expect(result.components.find((item) => item.id === "apps/web/package.json")).toMatchObject({ name: "@example/web", directory: "apps/web", family: "node", frameworks: ["React", "Vite"], evidence: "apps/web/package.json" });
    expect(result.components.find((item) => item.id === "package.json")!.workflows).toEqual([
      { name: "dev", kind: "develop" }, { name: "release:build", kind: "build" }, { name: "test:e2e", kind: "test" }, { name: "deploy", kind: "deploy" },
    ]);
    expect(result.relationships).toEqual(expect.arrayContaining([
      { from: "apps/web/package.json", to: "packages/core/package.json", kind: "depends-on", evidence: "apps/web/package.json" },
      { from: "services/worker/package.json", to: "packages/core/package.json", kind: "depends-on", evidence: "services/worker/package.json" },
      { from: "package.json", to: "apps/web/package.json", kind: "contains", evidence: "package.json" },
    ]));
    expect(JSON.stringify(result)).not.toMatch(/DO_NOT_EXECUTE|private-token|secret-command|secret-test|registry\.test/);
    expect(result.sites).toEqual([]); expect(ProjectCatalogSchema.safeParse(result).success).toBe(true);
  });

  it("never carries a previous project's components across root switches", async () => {
    const other = join(scratch, "other"); await mkdir(other);
    await put("package.json", { name: "first", dependencies: { react: "19" } });
    await put("pyproject.toml", '[project]\nname = "second"\ndependencies = ["fastapi>=0.1"]\n', other);
    const first = await scan(), second = await scan(other);
    expect(first.components.map((item) => item.name)).toEqual(["first"]);
    expect(second.components.map((item) => item.name)).toEqual(["second"]);
    expect(second.components[0]).toMatchObject({ family: "python", frameworks: ["FastAPI"] });
    expect(second.relationships).toEqual([]);
  });

  it("recognizes literal Python, Move, OCaml and Bazel metadata without inventing deployments", async () => {
    await put("backend/pyproject.toml", '[project]\nname = "api"\ndependencies = [\n "fastapi>=0.1", # comment\n "pydantic>=2",\n]\n[project.optional-dependencies]\ntest = ["pytest>=8"]\n');
    await put("worker/requirements.txt", "flask==3.0\n-r private.txt\n--index-url https://user:secret@packages.test\npandas>=2\n");
    await put("contracts/app/Move.toml", '[package]\nname = "app"\nedition = "2024.beta"\n[dependencies]\nCore = { local = "../core" }\nSui = { git = "https://secret@remote.test/repo", rev = "main" }\n[addresses]\napp = "0x0"\n');
    await put("contracts/core/Move.toml", '[package]\nname = "core"\n[addresses]\ncore = "0x0"\n');
    await put("bot/dune-project", "(lang dune 3.0)\n(name bot)\n");
    await put("MODULE.bazel", 'module(name = "catalog_fixture")\n# Never evaluate this file.\n');
    const result = await scan(); expect(result.scan.status).toBe("observed");
    expect(result.components.map((item) => item.family)).toEqual(expect.arrayContaining(["python", "move", "ocaml", "bazel"]));
    expect(result.components.find((item) => item.id === "backend/pyproject.toml")?.frameworks).toEqual(["FastAPI", "Pydantic", "pytest"]);
    expect(result.components.find((item) => item.id === "worker/requirements.txt")?.frameworks).toEqual(["Flask", "pandas"]);
    expect(result.relationships).toContainEqual({ from: "contracts/app/Move.toml", to: "contracts/core/Move.toml", kind: "depends-on", evidence: "contracts/app/Move.toml" });
    expect(JSON.stringify(result)).not.toMatch(/remote\.test|packages\.test|0x0|secret/); expect(result.sites).toEqual([]);
  });

  it("catalogs Bazel roots once and leaves individual BUILD packages to the build graph", async () => {
    await put("MODULE.bazel", 'module(name = "example")'); await put("WORKSPACE", "workspace(name = 'example')");
    await put("WORKSPACE.bazel", ""); await put("BUILD.bazel", "DO_NOT_EXECUTE");
    await Promise.all(Array.from({ length: 70 }, (_, index) => put(`src${index}/BUILD`, "DO_NOT_EXECUTE")));
    await put("web/package.json", { name: "web", dependencies: { react: "19" } });
    const result = await scan(); expect(result.scan.status).toBe("observed");
    expect(result.components.map((item) => item.id)).toEqual(["MODULE.bazel", "web/package.json"]);
  });

  it("finds explicit Hugo site identity, but does not read unrelated config.toml", async () => {
    await put("config.toml", "credential = 'DO_NOT_READ_AS_PROJECT_METADATA'\n");
    await put("website/hugo.toml", "baseURL = 'https://example.test/docs/'\ntitle = 'Documentation #1'\n");
    await mkdir(join(root, "legacy/content"), { recursive: true }); await mkdir(join(root, "legacy/layouts"));
    await put("legacy/config.toml", 'baseURL = "http://localhost:1313/"\ntitle = "Preview"\n');
    const result = await scan(); expect(result.scan.status).toBe("observed");
    expect(result.components.map((item) => item.id)).toEqual(["legacy/config.toml", "website/hugo.toml"]);
    expect(result.sites).toEqual([
      { name: "Preview", url: "http://localhost:1313/", evidence: "legacy/config.toml" },
      { name: "Documentation #1", url: "https://example.test/docs/", evidence: "website/hugo.toml" },
    ]);
    expect(JSON.stringify(result)).not.toContain("DO_NOT_READ");
  });

  it("refuses credentials, wildcards and non-web schemes in configured sites", async () => {
    const urls = ["https://user:secret@example.test/", "http://0.0.0.0:1313/", "http://[::]:1313/", "http://*.example.test/", "file:///private", "https://example.test/?token=secret"];
    await Promise.all(urls.map((url, index) => put(`site${index}/hugo.toml`, `title = "Site"\nbaseURL = ${JSON.stringify(url)}\n`)));
    const result = await scan(); expect(result.scan.status).toBe("partial"); expect(result.sites).toEqual([]);
  });

  it("ignores hidden, dependency, output and vendored trees without guessing workflows from code", async () => {
    for (const folder of [".git", ".private", "node_modules", "vendor", "build", "dist", "target", "bazel-bin"]) await put(`${folder}/package.json`, { name: "excluded" });
    await put("frontend/vite.config.ts", 'throw new Error("MUST_NOT_RUN"); proxy = "https://private:secret@rpc.test"');
    await put(".env", "SECRET=not-project-metadata");
    const result = await scan(); expect(result.components).toEqual([]); expect(result.relationships).toEqual([]); expect(result.sites).toEqual([]);
    expect(result.scan.status).toBe("observed");
  });

  it("does not follow file or directory links outside the project, while accepting an aliased root", async () => {
    const outside = join(scratch, "outside"), alias = join(scratch, "alias"); await mkdir(outside);
    await put("package.json", { name: "outside" }, outside); await symlink(outside, join(root, "linked-tree"));
    await symlink(join(outside, "package.json"), join(root, "package.json")); await symlink(root, alias);
    await put("actual/package.json", { name: "actual" });
    const result = await scan(alias); expect(result.scan.status).toBe("partial");
    expect(result.components.map((item) => item.name)).toEqual(["actual"]);
    expect(JSON.stringify(result)).not.toContain(outside);
  });

  it("rejects FIFOs without blocking", async () => {
    execFileSync("mkfifo", [join(root, "package.json")]);
    const start = Date.now(), result = await scan();
    expect(Date.now() - start).toBeLessThan(1000); expect(result.scan.status).toBe("unavailable"); expect(result.components).toEqual([]);
  });

  it("keeps malformed and oversized manifests partial without forwarding their data", async () => {
    await put("bad/package.json", "{ invalid JSON");
    await put("oversize/package.json", { name: "too-large", padding: "x".repeat(256 * 1024) });
    await put("badmove/Move.toml", '[package]\nname = "unterminated\n');
    await put("valid/package.json", { name: "valid", scripts: "invalid" });
    const result = await scan(); expect(result.scan.status).toBe("partial");
    expect(result.components.map((item) => item.name)).toEqual(["valid"]);
    expect(result.components[0].workflows).toEqual([]);
  });

  it("bounds component, workflow and depth coverage explicitly", async () => {
    await put("package.json", { name: "root", scripts: Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`test:${index}`, "never execute"])) });
    await Promise.all(Array.from({ length: 70 }, (_, index) => put(`component${index.toString().padStart(2, "0")}/package.json`, { name: `package-${index}` })));
    await put("a/b/c/d/e/f/g/package.json", { name: "too-deep" });
    const result = await scan(); expect(result.scan.status).toBe("partial"); expect(result.components).toHaveLength(64);
    expect(result.components[0].workflows).toHaveLength(24); expect(result.components.some((item) => item.name === "too-deep")).toBe(false);
    expect(ProjectCatalogSchema.safeParse(result).success).toBe(true);
  });

  it("does not infer local edges from registry URLs, escaping paths or ambiguous package names", async () => {
    await put("package.json", { name: "root", dependencies: { duplicate: "workspace:*", missing: "file:../outside", remote: "https://private:secret@host.test" } });
    await put("a/package.json", { name: "duplicate" }); await put("b/package.json", { name: "duplicate" });
    const result = await scan(); expect(result.scan.status).toBe("partial"); expect(result.relationships).toEqual([]);
  });

  it("requires a common declared workspace, not merely a unique package name elsewhere in the checkout", async () => {
    await put("first/package.json", { name: "first-workspace", workspaces: ["packages/*"] });
    await put("first/packages/app/package.json", { name: "app", dependencies: { unrelated: "workspace:*", local: "workspace:*" } });
    await put("first/packages/local/package.json", { name: "local" });
    await put("second/package.json", { name: "second-workspace", workspaces: ["packages/*"] });
    await put("second/packages/unrelated/package.json", { name: "unrelated" });
    const result = await scan(); expect(result.scan.status).toBe("partial");
    expect(result.relationships.filter((edge) => edge.kind === "depends-on")).toEqual([
      { from: "first/packages/app/package.json", to: "first/packages/local/package.json", kind: "depends-on", evidence: "first/packages/app/package.json" },
    ]);
  });

  it("bounds multiline TOML logical statements before repeated prefix scans become quadratic", async () => {
    await put("pyproject.toml", '[project]\nname = "bounded"\ndependencies = [\n' + '"x",\n'.repeat(45_000));
    const start = Date.now(), result = await scan();
    expect(Date.now() - start).toBeLessThan(1000); expect(result.scan.status).toBe("partial");
    expect(result.components.map((item) => item.name)).toEqual(["bounded"]);
  });

  it("reports absent metadata and missing roots distinctly and cancels without stale results", async () => {
    expect(await scan()).toMatchObject({ scan: { status: "observed" }, components: [] });
    expect(await scan(join(root, "missing"))).toMatchObject({ scan: { status: "unavailable" }, components: [] });
    const controller = new AbortController();
    const pending = discoverProjectCatalog(root, controller.signal); controller.abort();
    expect(await pending).toMatchObject({ scan: { status: "unavailable", message: "Catalog scan cancelled" }, components: [], relationships: [], sites: [] });
  });

  it("does not queue another native walk while a timed-out filesystem operation is still pending", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    await put("package.json", { name: "after-cleanup" });
    try {
      const result = await discoverProjectCatalog(root, new AbortController().signal, { beforeWalk: () => blocked, timeoutMs: 5 });
      expect(result.scan.status).toBe("unavailable");
      expect(await scan()).toMatchObject({ scan: { status: "unavailable", message: "A previous catalog filesystem read is still finishing" }, components: [] });
    } finally { release(); await new Promise<void>((resolve) => setImmediate(resolve)); }
    expect((await scan()).components.map((item) => item.name)).toEqual(["after-cleanup"]);
  });
});
