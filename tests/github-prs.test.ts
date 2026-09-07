import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { readFileSync, readlinkSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { GithubPrProvider, githubOrigin, githubPrCommand, githubOwnerOptions, parseGithubPrs } from "../core/github-prs";
import { BuildQueryCleanupError } from "../core/build-graph";
import { GithubPrRequestSchema } from "../protocol/github-prs";
import { PROTOCOL_VERSION, parseCoreResponseForRequest } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";

const raw = () => [{ number: 3, title: "Make task navigation direct", state: "OPEN", isDraft: true, author: { login: "operator", id: "ignored" },
  updatedAt: "2026-09-07T12:00:00Z", url: "https://github.com/example/project/pull/3", changedFiles: 2, files: [{ path: "src/app.ts", additions: 2, deletions: 1 }] }];
const owned: string[] = [];
const children: ChildProcess[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) { const closed = new Promise<void>((done) => child.once("close", () => done())); child.kill("SIGKILL"); await closed; }
  await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
describe("GitHub PR fixed scope and validation", () => {
  it.each(["git@github.com:example/project.git", "https://github.com/example/project.git", "ssh://git@github.com/example/project", "https://github.com/example/project"])("accepts exact GitHub origin %s", (remote) => expect(githubOrigin(remote)).toBe("example/project"));
  it.each(["https://evil.example/example/project", "https://user:secret@github.com/example/project", "https://github.com/example/project?token=x", "git@github.com:example/project\nhttps://github.com/other/repo", "https://github.com/example/../bad", "-u evil", "https://github.com/example/.."]) ("rejects ambiguous or unsafe remote %s", (remote) => expect(() => githubOrigin(remote)).toThrow());
  it("validates changed-file coverage and preserves partial list explicitly", () => {
    const observation = parseGithubPrs(JSON.stringify(raw()), "repo", "world", "example/project");
    expect(observation.pullRequests[0]).toMatchObject({ author: "operator", paths: ["src/app.ts"], changedFiles: 2 });
    const deleted = raw(); deleted[0].author = null as never;
    expect(parseGithubPrs(JSON.stringify(deleted), "repo", "world", "example/project").pullRequests[0].author).toBe("Deleted account");
  });
  it("accepts GitHub canonical owner/repository case without widening URL authority", () => {
    const rows = raw(); rows[0].url = "https://github.com/Example/Project/pull/3";
    expect(parseGithubPrs(JSON.stringify(rows), "repo", "world", "example/project").pullRequests[0].url).toBe(rows[0].url);
    for (const url of ["https://github.com/Example/Project/pull/03", "https://github.com/Example/Project/PULL/3", "https://github.com/Example/Project/pull/3?redirect=evil"]) {
      rows[0].url = url; expect(() => parseGithubPrs(JSON.stringify(rows), "repo", "world", "example/project")).toThrow();
    }
  });
  it.each(["foreign URL", "unsafe path", "duplicate PR", "duplicate file", "bad state", "bad date", "excess list", "control title"])("rejects %s", (kind) => {
    const rows = raw();
    if (kind === "foreign URL") rows[0].url = "https://github.com/other/repo/pull/3";
    if (kind === "unsafe path") rows[0].files[0].path = "../secret";
    if (kind === "duplicate PR") rows.push(rows[0]);
    if (kind === "duplicate file") rows[0].files.push(rows[0].files[0]);
    if (kind === "bad state") rows[0].state = "secret";
    if (kind === "bad date") rows[0].updatedAt = "tomorrow";
    if (kind === "excess list") rows.push(...Array.from({ length: 21 }, () => rows[0]));
    if (kind === "control title") rows[0].title = "secret\u001b[1m";
    expect(() => parseGithubPrs(JSON.stringify(rows), "repo", "world", "example/project")).toThrow();
  });
  it("rejects mixed authority, another repository/world and unrelated-command PR results", () => {
    const snapshot = initialSnapshot();
    const request = GithubPrRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: "prs", type: "githubPrs.refresh", repositoryId: snapshot.project.id, worldId: snapshot.world.id });
    const githubPrs = parseGithubPrs(JSON.stringify(raw()), request.repositoryId, request.worldId, "example/project");
    const reply = { protocolVersion: PROTOCOL_VERSION, requestId: "prs", sequence: 0, ok: true, snapshot, githubPrs };
    expect(parseCoreResponseForRequest(reply, request)).toEqual(reply);
    expect(() => parseCoreResponseForRequest({ ...reply, githubPrs: { ...githubPrs, repositoryId: "other" } }, request)).toThrow();
    expect(() => parseCoreResponseForRequest({ ...reply, githubPrs: { ...githubPrs, worldId: "other" } }, request)).toThrow();
    expect(() => parseCoreResponseForRequest({ ...reply, file: { kind: "read", path: "src/a", content: "", size: 0, revision: "a".repeat(64) } }, request)).toThrow();
    expect(() => parseCoreResponseForRequest(reply, { protocolVersion: PROTOCOL_VERSION, requestId: "prs", type: "workspace.snapshot" })).toThrow();
    expect(GithubPrRequestSchema.safeParse({ ...request, repository: "other/repo", shell: "gh secret" }).success).toBe(false);
  });
  it("fences a moved origin and shares one pending read", async () => {
    const git = vi.fn().mockResolvedValueOnce("git@github.com:example/project.git\n").mockResolvedValueOnce("git@github.com:other/repo.git\n");
    const command = vi.fn(async () => JSON.stringify(raw()));
    const provider = new GithubPrProvider("/unused", "repo", "world", command, git);
    const first = provider.refresh(); expect(provider.refresh()).toBe(first);
    await expect(first).rejects.toThrow("Origin changed"); expect(command).toHaveBeenCalledTimes(1);
    await provider.dispose(); await expect(provider.refresh()).rejects.toThrow("Disposed");
  });
  it("disposal waits for the actual in-flight reader to settle", async () => {
    let release!: () => void;
    const command = vi.fn((_root: string, _repo: string, signal: AbortSignal) => new Promise<string>((_resolve, reject) => {
      signal.addEventListener("abort", () => { release = () => reject(new Error("closed")); });
    }));
    const provider = new GithubPrProvider("/unused", "repo", "world", command, async () => "git@github.com:example/project.git\n");
    const reading = provider.refresh().catch(() => {});
    await vi.waitFor(() => expect(command).toHaveBeenCalledTimes(1));
    let disposed = false; const closing = provider.dispose().then(() => { disposed = true; });
    await Promise.resolve(); expect(disposed).toBe(false); release(); await closing; await reading;
  });
  it("uses fixed argv, does not expose stderr, and terminates a TERM-resistant owned command", async () => {
    const root = await mkdtemp(join(tmpdir(), "github-pr-command-")); owned.push(root);
    const executable = join(root, "gh");
    await writeFile(executable, `#!${process.execPath}\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o700 });
    const config = { ...await githubOwnerOptions(root), executable, ownerScript: resolve("core/agents/owner-process.mjs") };
    const options = async () => config;
    for (const name of ["NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "LD_AUDIT"]) vi.stubEnv(name, "");
    const result = JSON.parse(await githubPrCommand(root, "example/project", new AbortController().signal, options));
    expect(result).toEqual(["pr", "list", "--repo", "github.com/example/project", "--state", "all", "--limit", "20", "--json", "number,title,state,isDraft,author,updatedAt,url,changedFiles,files"]);
    await writeFile(executable, `#!${process.execPath}\nprocess.stderr.write('DO-NOT-EXPOSE');process.exit(1);\n`, { mode: 0o700 });
    await expect(githubPrCommand(root, "example/project", new AbortController().signal, options)).rejects.toThrow(/Bazel query failed/);
    await writeFile(executable, `#!${process.execPath}\nprocess.on('SIGTERM',()=>{});setInterval(()=>{},100);\n`, { mode: 0o700 });
    const abort = new AbortController(), reading = githubPrCommand(root, "example/project", abort.signal, options);
    setTimeout(() => abort.abort(), 100);
    await expect(reading).rejects.toThrow(/cancelled/);
  });
  it("blocks another read after uncertain owned cleanup", async () => {
    const command = vi.fn(async () => { throw new BuildQueryCleanupError("unknown"); });
    const provider = new GithubPrProvider("/unused", "repo", "world", command, async () => "git@github.com:example/project.git\n");
    await expect(provider.refresh()).rejects.toThrow("unknown");
    await expect(provider.refresh()).rejects.toThrow("cleanup unconfirmed"); expect(command).toHaveBeenCalledTimes(1); await provider.dispose();
  });
  it("actual GitHub command owner survives caller SIGKILL only long enough to kill the held command and detached descendant", async () => {
    const root = await mkdtemp(join(tmpdir(), "github-pr-core-death-")); owned.push(root);
    const script = join(root, "gh"), namespacePath = join(root, "namespace"), readyPath = join(root, "ready");
    await writeFile(script, `#!${process.execPath}\nconst fs=require('node:fs');fs.writeFileSync(${JSON.stringify(namespacePath)},fs.readlinkSync('/proc/self/ns/pid'));
require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(readyPath)},'ready');process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`)}],{detached:true,stdio:'ignore'});process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`, { mode: 0o700 });
    const config = { ...await githubOwnerOptions(root), executable: script, ownerScript: resolve("core/agents/owner-process.mjs") };
    const caller = join(root, "caller.cjs");
    await build({ stdin: { contents: `import {githubPrCommand} from ${JSON.stringify(resolve("core/github-prs.ts"))}; void githubPrCommand(${JSON.stringify(root)},'example/project',new AbortController().signal,async()=>(${JSON.stringify(config)})).catch(()=>{});`, resolveDir: process.cwd() }, outfile: caller, bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
    const env = { ...process.env, NODE_OPTIONS: "", NODE_PATH: "", LD_PRELOAD: "", LD_AUDIT: "" };
    const child = spawn(process.execPath, [caller], { env, stdio: "ignore" }); children.push(child);
    await vi.waitFor(async () => expect(await readFile(readyPath, "utf8")).toBe("ready"), { timeout: 4000 });
    const namespace = await readFile(namespacePath, "utf8");
    const members = () => readdirSync("/proc").filter((name) => /^\d+$/.test(name)).filter((pid) => {
      try { return readlinkSync(`/proc/${pid}/ns/pid`) === namespace && !/[ZX]/.test(readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1]![0]!); } catch { return false; }
    });
    expect(members().length).toBeGreaterThanOrEqual(3);
    child.kill("SIGKILL");
    await vi.waitFor(() => expect(members()).toEqual([]), { timeout: 4000 });
  }, 12000);
});
