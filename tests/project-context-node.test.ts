// @vitest-environment node
import { createServer as createHttpServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createNodeServerDiscovery, discoverNodeServers, parseNodeListeners, type NodeDiscoveryIO } from "../core/project-context/node";
import { ProjectServerSchema } from "../protocol/project-context";

const root = "/projects/example/feature";
const proc = "/test-proc";
const header = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode";
function row(inode = "123", address = "0100007F", port = "1435", state = "0A") {
  return `  0: ${address}:${port} 00000000:0000 ${state} 00000000:00000000 00:00000000 00000000 1000 0 ${inode} 1`;
}
function stat(pid: number, start = "100") { return `${pid} (node with ) inside) S ${Array(18).fill("0").join(" ")} ${start} 0\n`; }
function absent(): Error { return Object.assign(new Error("Missing fixture"), { code: "ENOENT" }); }
function denied(): Error { return Object.assign(new Error("Denied fixture"), { code: "EACCES" }); }

function fixture() {
  const links = new Map<string, string>();
  const texts = new Map<string, string>([[`${proc}/net/tcp`, `${header}\n${row()}\n`], [`${proc}/net/tcp6`, `${header}\n`]]);
  const listings = new Map<string, string[]>([[proc, []], [root, []]]);
  const real = new Map<string, string>([[root, root]]);
  const io: NodeDiscoveryIO = {
    read: vi.fn(async (path, limit, signal) => {
      signal.throwIfAborted();
      const value = texts.get(path);
      if (value === undefined) throw absent();
      if (value.length > limit) throw new Error("Limit");
      return value;
    }),
    list: vi.fn(async (path, limit, signal) => {
      signal.throwIfAborted();
      const names = listings.get(path);
      if (!names) throw absent();
      const bounded = names.slice(0, limit);
      return { names: bounded, truncated: names.length > limit,
        directories: bounded.filter((name) => listings.has(`${path}/${name}`) && !links.has(`${path}/${name}`)),
        files: bounded.filter((name) => texts.has(`${path}/${name}`)),
      };
    }),
    link: vi.fn(async (path) => { const value = links.get(path); if (value === undefined) throw absent(); return value; }),
    real: vi.fn(async (path) => { const value = real.get(path); if (value === undefined) throw absent(); return value; }),
  };
  function process(pid: number, cwd = root, executable = "/nix/store/node/bin/node", inode = "123") {
    listings.get(proc)!.push(String(pid));
    links.set(`${proc}/${pid}/exe`, executable);
    links.set(`${proc}/${pid}/cwd`, cwd);
    links.set(`${proc}/${pid}/fd/7`, `socket:[${inode}]`);
    texts.set(`${proc}/${pid}/stat`, stat(pid));
    listings.set(`${proc}/${pid}/fd`, ["7"]);
  }
  const probe = vi.fn(async () => false);
  const discover = () => createNodeServerDiscovery({ io, procRoot: proc, hostname: "tower0", probe });
  return { io, links, texts, listings, real, process, probe, discover };
}
const signal = () => new AbortController().signal;

describe("Node listener parsing", () => {
  it("decodes actual IPv4/IPv6 listening ports and excludes established sockets", () => {
    expect(parseNodeListeners(`${header}\n${row()}\n${row("124", "0100007F", "FFFF", "01")}\n`)).toEqual({
      listeners: [{ inode: "123", address: "127.0.0.1", port: 5173, protocol: "tcp" }], partial: false,
    });
    expect(parseNodeListeners(`${header}\n${row("123", "00000000000000000000000001000000")}\n`, true).listeners[0]?.address).toBe("0:0:0:0:0:0:0:1");
    expect(parseNodeListeners(`${header}\n${row("124", "00000000000000000000000000000000")}\n`, true).listeners[0]?.address).toBe("0:0:0:0:0:0:0:0");
  });

  it("fails closed on malformed, zero-port, wrong-width, and missing-inode records", () => {
    for (const bad of ["garbage", row("0"), row("not-inode"), row("123", "GG00007F"), row("123", "0100007F", "0000"), row("123", "1234")]) {
      expect(parseNodeListeners(`${header}\n${bad}\n`)).toEqual({ listeners: [], partial: true });
    }
    expect(parseNodeListeners("not procfs\n").partial).toBe(true);
    expect(parseNodeListeners(`${header}\n${Array(4100).fill(row()).join("\n")}`).partial).toBe(true);
  });
});

describe("bounded local runtime discovery", () => {
  it("publishes owned TCP sockets without pretending they are HTTP", async () => {
    const data = fixture();
    data.process(42, `${root}/frontend`);
    const result = await data.discover()(root, signal());
    expect(result.scan.status).toBe("observed");
    expect(result.servers).toEqual([{ pid: 42, name: "Node.js", directory: `${root}/frontend`, association: "worktree", endpoints: [{ address: "127.0.0.1", port: 5173, protocol: "tcp" }] }]);
    expect(ProjectServerSchema.safeParse(result.servers[0]).success).toBe(true);
    const readPaths = vi.mocked(data.io.read).mock.calls.map(([path]) => path);
    expect(readPaths.every((path) => /\/(?:stat|tcp|tcp6|package\.json)$/.test(path))).toBe(true);
    expect(readPaths.some((path) => /cmdline|environ|\.env$/.test(path))).toBe(false);
  });

  it("ignores other worktrees, prefix collisions, unknown executables, and unowned listeners", async () => {
    const data = fixture();
    data.process(1, "/projects/example/master");
    data.process(2, `${root}-other`);
    data.process(3, root, "/usr/bin/ruby");
    data.process(4, root, "/usr/bin/node", "999");
    const result = await data.discover()(root, signal());
    expect(result.servers).toEqual([]);
    expect(data.probe).not.toHaveBeenCalled();
  });

  it.each([["node", "Node.js"], ["nodejs", "Node.js"], ["python", "Python"], ["python3", "Python"],
    ["python3.11", "Python"], ["python3.13", "Python"], ["hugo", "Hugo"]])("recognizes exact executable %s as %s", async (executable, name) => {
    const data = fixture();
    data.process(42, `${root}/service`, `/nix/store/runtime/bin/${executable}`);
    const result = await data.discover()(root, signal());
    expect(result.servers).toHaveLength(1);
    expect(result.servers[0]).toMatchObject({ name, association: "worktree", endpoints: [{ port: 5173 }] });
  });

  it.each(["python-helper", "python3.11-config", "hugo-server", "uvicorn", "vite", "node (deleted)"])("does not infer a runtime from executable %s", async (executable) => {
    const data = fixture();
    data.process(42, root, `/usr/bin/${executable}`);
    expect((await data.discover()(root, signal())).servers).toEqual([]);
    expect(data.probe).not.toHaveBeenCalled();
  });

  it("only adds URLs after HTTP evidence; wildcard URLs use the real hostname", async () => {
    const data = fixture();
    data.process(42);
    data.texts.set(`${proc}/net/tcp`, `${header}\n${row("123", "00000000")}\n`);
    data.probe.mockResolvedValue(true);
    const result = await data.discover()(root, signal());
    expect(data.probe).toHaveBeenCalledWith("127.0.0.1", 5173, expect.any(AbortSignal), "tower0:5173");
    expect(result.servers[0]?.endpoints[0]?.url).toBe("http://tower0:5173/");
    data.texts.set(`${proc}/net/tcp`, `${header}\n${row()}\n`);
    expect((await data.discover()(root, signal())).servers[0]?.endpoints[0]?.url).toBe("http://localhost:5173/");
  });

  it("matches an exact Bazel output alias only with a source backlink into this worktree", async () => {
    const data = fixture();
    const execroot = "/cache/bazel/key/execroot/_main";
    const target = `${execroot}/bazel-out/k8-fastbuild/bin`;
    data.process(42, `${target}/frontend/dev_/dev.runfiles/_main/frontend`);
    data.links.set(`${root}/bazel-bin`, target);
    data.real.set(`${root}/bazel-bin`, target);
    data.real.set(`${execroot}/frontend`, `${root}/frontend`);
    expect((await data.discover()(root, signal())).servers[0]?.association).toBe("bazel-output");
    data.real.set(`${execroot}/frontend`, "/projects/example/master/frontend");
    expect((await data.discover()(root, signal())).servers).toEqual([]);
    data.real.set(`${root}/bazel-bin`, "/unrelated/output");
    expect((await data.discover()(root, signal())).servers).toEqual([]);
  });

  function nestedBazel() {
    const data = fixture();
    const buildRoot = `${root}/apps/media`;
    const execroot = "/cache/bazel/nested/execroot/_main";
    const target = `${execroot}/bazel-out/k8-fastbuild/bin`;
    data.listings.set(root, ["apps"]);
    data.listings.set(`${root}/apps`, ["media"]);
    data.listings.set(buildRoot, ["MODULE.bazel", "bazel-bin"]);
    data.texts.set(`${buildRoot}/MODULE.bazel`, "");
    data.real.set(`${root}/apps`, `${root}/apps`);
    data.real.set(buildRoot, buildRoot);
    data.links.set(`${buildRoot}/bazel-bin`, target);
    data.real.set(`${buildRoot}/bazel-bin`, target);
    data.real.set(`${execroot}/frontend`, `${buildRoot}/frontend`);
    data.process(42, `${target}/frontend/dev_/dev.runfiles/_main/frontend`);
    return { ...data, buildRoot, execroot, target };
  }

  it("finds a nested Bazel build root with an exact source backlink", async () => {
    const data = nestedBazel();
    expect((await data.discover()(root, signal())).servers[0]).toMatchObject({ pid: 42, name: "Node.js", association: "bazel-output" });
    expect(data.io.read).not.toHaveBeenCalledWith(`${data.buildRoot}/MODULE.bazel`, expect.anything(), expect.anything());
  });

  it.each(["sibling-worktree", "other-build-root", "no-marker", "nested-git", "symlink-directory"])("refuses nested Bazel ownership with %s", async (problem) => {
    const data = nestedBazel();
    if (problem === "sibling-worktree") data.real.set(`${data.execroot}/frontend`, "/projects/example/master/apps/media/frontend");
    if (problem === "other-build-root") data.real.set(`${data.execroot}/frontend`, `${root}/apps/other/frontend`);
    if (problem === "no-marker") data.texts.delete(`${data.buildRoot}/MODULE.bazel`);
    if (problem === "nested-git") data.listings.get(data.buildRoot)!.push(".git");
    if (problem === "symlink-directory") data.links.set(`${root}/apps`, "/other/apps");
    expect((await data.discover()(root, signal())).servers).toEqual([]);
    expect(data.probe).not.toHaveBeenCalled();
  });

  it("rejects nested aliases that become stale during the HTTP probe", async () => {
    const data = nestedBazel();
    data.probe.mockImplementation(async () => { data.real.set(`${data.buildRoot}/bazel-bin`, "/other/bazel-bin"); return true; });
    const result = await data.discover()(root, signal());
    expect(result.servers).toEqual([]);
    expect(result.scan.status).toBe("partial");
  });

  it("bounds nested-root discovery and excludes generated and vendor directories", async () => {
    const data = fixture();
    data.listings.set(root, ["node_modules", "bazel-out", ...Array.from({ length: 40 }, (_, i) => `dir${i}`)]);
    for (const name of data.listings.get(root)!) { data.listings.set(`${root}/${name}`, []); data.real.set(`${root}/${name}`, `${root}/${name}`); }
    expect((await data.discover()(root, signal())).scan.status).toBe("partial");
    const projectLists = vi.mocked(data.io.list).mock.calls.filter(([path]) => path.startsWith(root));
    expect(projectLists.length).toBeLessThanOrEqual(32);
    expect(projectLists.some(([path]) => path.endsWith("/node_modules") || path.endsWith("/bazel-out"))).toBe(false);
  });

  it("hides an Electron package's internal Node listener without hiding its Python backend", async () => {
    const data = fixture();
    data.texts.set(`${root}/package.json`, JSON.stringify({ devDependencies: { electron: "1" }, main: "dist/main.js", build: { appId: "example.desktop" } }));
    data.process(41);
    data.process(42, root, "/usr/bin/python3");
    const result = await data.discover()(root, signal());
    expect(result.servers.map(({ pid, name }) => ({ pid, name }))).toEqual([{ pid: 42, name: "Python" }]);
  });

  it("detects Electron desktop entry metadata without a package main", async () => {
    const data = fixture();
    data.texts.set(`${root}/package.json`, JSON.stringify({ devDependencies: { electron: "1" } }));
    data.real.set(`${root}/app/electron`, `${root}/app/electron`);
    data.listings.set(`${root}/app/electron`, ["main.ts"]);
    data.texts.set(`${root}/app/electron/main.ts`, "not executed or read");
    data.process(42);
    expect((await data.discover()(root, signal())).servers).toEqual([]);
    expect(vi.mocked(data.io.read).mock.calls.some(([path]) => path.endsWith("main.ts"))).toBe(false);
  });

  it("does not mistake a Node library's main plus Electron test dependency for a desktop app", async () => {
    const data = fixture();
    data.texts.set(`${root}/package.json`, JSON.stringify({ main: "index.js", devDependencies: { electron: "1" } }));
    data.process(42);
    expect((await data.discover()(root, signal())).servers[0]).toMatchObject({ pid: 42, name: "Node.js" });
  });

  it("keeps independent nested Node packages and Electron-as-tooling projects visible", async () => {
    const data = fixture();
    data.texts.set(`${root}/package.json`, JSON.stringify({ devDependencies: { electron: "1" }, main: "dist/main.js", build: { appId: "example.desktop" } }));
    data.texts.set(`${root}/web/package.json`, JSON.stringify({ name: "independent-web" }));
    data.process(42, `${root}/web`);
    expect((await data.discover()(root, signal())).servers[0]?.pid).toBe(42);
    data.texts.set(`${root}/web/package.json`, JSON.stringify({ devDependencies: { electron: "1" }, main: "index.js" }));
    expect((await data.discover()(root, signal())).servers[0]?.pid).toBe(42);
  });

  it("uses Bazel source ownership for Electron suppression and nearer independent web packages", async () => {
    const data = nestedBazel();
    data.texts.set(`${data.buildRoot}/package.json`, JSON.stringify({ dependencies: { electron: "1" }, main: "desktop.cjs", config: { forge: {} } }));
    expect((await data.discover()(root, signal())).servers).toEqual([]);
    data.texts.set(`${data.buildRoot}/frontend/package.json`, JSON.stringify({ name: "independent-frontend" }));
    expect((await data.discover()(root, signal())).servers[0]?.association).toBe("bazel-output");
  });

  it("reports inaccessible proc metadata without claiming the project has stopped", async () => {
    const data = fixture();
    vi.mocked(data.io.list).mockRejectedValue(denied());
    expect((await data.discover()(root, signal())).scan.status).toBe("unavailable");
    const partiallyReadable = fixture();
    partiallyReadable.process(42);
    partiallyReadable.process(43);
    const originalLink = partiallyReadable.io.link;
    partiallyReadable.io.link = async (path) => { if (path === `${proc}/43/exe`) throw denied(); return originalLink(path); };
    const result = await partiallyReadable.discover()(root, signal());
    expect(result.scan.status).toBe("partial");
    expect(result.servers).toHaveLength(1);
  });

  it.each(["start", "cwd", "executable", "socket"])("discards evidence when %s changes during the probe", async (change) => {
    const data = fixture();
    data.process(42);
    data.probe.mockImplementation(async () => {
      if (change === "start") data.texts.set(`${proc}/42/stat`, stat(42, "200"));
      if (change === "cwd") data.links.set(`${proc}/42/cwd`, "/projects/example/master");
      if (change === "executable") data.links.set(`${proc}/42/exe`, "/other/node");
      if (change === "socket") data.links.set(`${proc}/42/fd/7`, "socket:[999]");
      return true;
    });
    const result = await data.discover()(root, signal());
    expect(result.servers).toEqual([]);
    expect(result.scan.status).toBe("partial");
  });

  it("bounds process and descriptor enumeration and marks truncated observations", async () => {
    const data = fixture();
    data.process(42);
    data.listings.set(`${proc}/42/fd`, ["7", ...Array.from({ length: 1200 }, (_, i) => String(i + 100))]);
    const result = await data.discover()(root, signal());
    expect(result.scan.status).toBe("partial");
    expect(data.io.list).toHaveBeenCalledWith(proc, 4096, expect.any(AbortSignal));
    expect(data.io.list).toHaveBeenCalledWith(`${proc}/42/fd`, 1024, expect.any(AbortSignal));
  });

  it("cancels immediately even when an injected filesystem call never returns", async () => {
    const data = fixture();
    data.io.real = () => new Promise(() => {});
    const controller = new AbortController();
    const result = data.discover()(root, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    await expect(data.discover()(root, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("returns bounded partial status when a scan exceeds its deadline", async () => {
    const data = fixture();
    data.io.real = () => new Promise(() => {});
    const result = await createNodeServerDiscovery({ io: data.io, timeoutMs: 10 })(root, signal());
    expect(result).toEqual({ scan: { status: "partial", message: "Local server discovery reached its time limit" }, servers: [] });
  });

  it.each(["real", "list"] as const)("keeps admission until a timed-out native %s call settles", async (operation) => {
    const data = fixture();
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let first = true;
    if (operation === "real") {
      const original = data.io.real;
      data.io.real = vi.fn(async (path) => {
        if (first) { first = false; entered(); await held; }
        return original(path);
      });
    } else {
      const original = data.io.list;
      data.io.list = vi.fn(async (path, limit, signal) => {
        if (first) { first = false; entered(); await held; }
        return original(path, limit, signal);
      });
    }
    const discover = createNodeServerDiscovery({ io: data.io, procRoot: proc, timeoutMs: 20 });
    const pending = discover(root, signal());
    await started;
    expect((await pending).scan.status).toBe("partial");
    const calls = () => Object.values(data.io).reduce((sum, method) => sum + vi.mocked(method).mock.calls.length, 0);
    const before = calls();
    expect((await discover(root, signal())).scan).toEqual({ status: "unavailable", message: "A previous local server scan is still settling" });
    expect((await discover("/another/project", signal())).scan.status).toBe("unavailable");
    expect(calls()).toBe(before);
    release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((await discover(root, signal())).scan.status).toBe("observed");
  });

  it("probes a real local HTTP listener but does not invent HTTP for a raw TCP socket", async () => {
    // Use an independent checkout-shaped directory: the test runner itself belongs to this Electron app.
    const directory = await mkdtemp(join(tmpdir(), "swarm-runtime-test-"));
    const child = spawn(process.execPath, ["-e", `
      const http = require('node:http').createServer((req, res) => { res.writeHead(req.method === 'HEAD' ? 204 : 405); res.end(); });
      const tcp = require('node:net').createServer(socket => socket.on('data', () => socket.end('not http')));
      http.listen(0, '127.0.0.1', () => tcp.listen(0, '127.0.0.1', () => {
        process.stdout.write(JSON.stringify({ http: http.address().port, tcp: tcp.address().port }) + '\\n');
      }));
    `], { cwd: directory, stdio: ["ignore", "pipe", "ignore"] });
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
    try {
      const ports = await new Promise<{ http: number; tcp: number }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Fixture listener startup timed out")), 2000);
        let text = "";
        child.stdout!.on("data", (data: Buffer) => { text += data.toString(); if (text.includes("\n")) { clearTimeout(timeout); resolve(JSON.parse(text)); } });
        child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      });
      const result = await discoverNodeServers(directory, signal());
      const server = result.servers.find((entry) => entry.pid === child.pid);
      expect(server?.endpoints.find((endpoint) => endpoint.port === ports.http)?.url).toBe(`http://localhost:${ports.http}/`);
      expect(server?.endpoints.find((endpoint) => endpoint.port === ports.tcp)).toMatchObject({ protocol: "tcp", address: "127.0.0.1" });
      expect(server?.endpoints.find((endpoint) => endpoint.port === ports.tcp)?.url).toBeUndefined();
    } finally {
      child.kill("SIGKILL");
      await closed;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uses the exact displayed Host without DNS and suppresses denied, failed, or redirected URLs", async () => {
    const observedHosts: Array<string | undefined> = [];
    let status = 204;
    const http = createHttpServer((request, response) => {
      observedHosts.push(request.headers.host);
      response.writeHead(status);
      response.end();
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    try {
      const port = (http.address() as { port: number }).port;
      const data = fixture();
      data.process(42);
      data.texts.set(`${proc}/net/tcp`, `${header}\n${row("123", "00000000", port.toString(16).padStart(4, "0"))}\n`);
      const discover = createNodeServerDiscovery({ io: data.io, procRoot: proc, hostname: "host-check.invalid" });
      expect((await discover(root, signal())).servers[0]?.endpoints[0]?.url).toBe(`http://host-check.invalid:${port}/`);
      for (status of [403, 500, 302]) {
        const endpoint = (await discover(root, signal())).servers[0]?.endpoints[0];
        expect(endpoint).toMatchObject({ address: "0.0.0.0", port, protocol: "tcp" });
        expect(endpoint?.url).toBeUndefined();
      }
      expect(observedHosts).toEqual(Array(4).fill(`host-check.invalid:${port}`));
    } finally { await new Promise<void>((resolve) => http.close(() => resolve())); }
  });
});
