import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GithubPrProvider, githubOrigin, githubPrCommand, parseGithubPrs } from "../core/github-prs";
import { GithubPrRequestSchema } from "../protocol/github-prs";
import { PROTOCOL_VERSION, parseCoreResponseForRequest } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";

const raw = () => [{ number: 3, title: "Make task navigation direct", state: "OPEN", isDraft: true, author: { login: "operator", id: "ignored" },
  updatedAt: "2026-09-07T12:00:00Z", url: "https://github.com/example/project/pull/3", changedFiles: 2, files: [{ path: "src/app.ts", additions: 2, deletions: 1 }] }];
const owned: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
describe("GitHub PR fixed scope and validation", () => {
  it.each(["git@github.com:example/project.git", "https://github.com/example/project.git", "ssh://git@github.com/example/project", "https://github.com/example/project"])("accepts exact GitHub origin %s", (remote) => expect(githubOrigin(remote)).toBe("example/project"));
  it.each(["https://evil.example/example/project", "https://user:secret@github.com/example/project", "https://github.com/example/project?token=x", "git@github.com:example/project\nhttps://github.com/other/repo", "https://github.com/example/../bad", "-u evil", "https://github.com/example/.."]) ("rejects ambiguous or unsafe remote %s", (remote) => expect(() => githubOrigin(remote)).toThrow());
  it("validates changed-file coverage and preserves partial list explicitly", () => {
    const observation = parseGithubPrs(JSON.stringify(raw()), "repo", "world", "example/project");
    expect(observation.pullRequests[0]).toMatchObject({ author: "operator", paths: ["src/app.ts"], changedFiles: 2 });
    const deleted = raw(); deleted[0].author = null as never;
    expect(parseGithubPrs(JSON.stringify(deleted), "repo", "world", "example/project").pullRequests[0].author).toBe("Deleted account");
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
    vi.stubEnv("PATH", root);
    const result = JSON.parse(await githubPrCommand(root, "example/project", new AbortController().signal));
    expect(result).toEqual(["pr", "list", "--repo", "github.com/example/project", "--state", "all", "--limit", "20", "--json", "number,title,state,isDraft,author,updatedAt,url,changedFiles,files"]);
    await writeFile(executable, `#!${process.execPath}\nprocess.stderr.write('DO-NOT-EXPOSE');process.exit(1);\n`, { mode: 0o700 });
    await expect(githubPrCommand(root, "example/project", new AbortController().signal)).rejects.toThrow("GitHub read unavailable");
    await writeFile(executable, `#!${process.execPath}\nprocess.on('SIGTERM',()=>{});setInterval(()=>{},100);\n`, { mode: 0o700 });
    const abort = new AbortController(), reading = githubPrCommand(root, "example/project", abort.signal);
    setTimeout(() => abort.abort(), 100);
    await expect(reading).rejects.toThrow("GitHub read unavailable");
  });
});
