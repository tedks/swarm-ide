// @vitest-environment node
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
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
  const listings = new Map<string, string[]>([[proc, []]]);
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
      return { names: names.slice(0, limit), truncated: names.length > limit };
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

describe("bounded Node discovery", () => {
  it("publishes owned TCP sockets without pretending they are HTTP", async () => {
    const data = fixture();
    data.process(42, `${root}/frontend`);
    const result = await data.discover()(root, signal());
    expect(result.scan.status).toBe("observed");
    expect(result.servers).toEqual([{ pid: 42, name: "Node.js", directory: `${root}/frontend`, association: "worktree", endpoints: [{ address: "127.0.0.1", port: 5173, protocol: "tcp" }] }]);
    expect(ProjectServerSchema.safeParse(result.servers[0]).success).toBe(true);
    const readPaths = vi.mocked(data.io.read).mock.calls.map(([path]) => path);
    expect(readPaths.every((path) => /\/(?:stat|tcp|tcp6)$/.test(path))).toBe(true);
    expect(readPaths.some((path) => /cmdline|environ|package\.json/.test(path))).toBe(false);
  });

  it("ignores other worktrees, prefix collisions, non-Node executables, and unowned listeners", async () => {
    const data = fixture();
    data.process(1, "/projects/example/master");
    data.process(2, `${root}-other`);
    data.process(3, root, "/usr/bin/python3");
    data.process(4, root, "/usr/bin/node", "999");
    const result = await data.discover()(root, signal());
    expect(result.servers).toEqual([]);
    expect(data.probe).not.toHaveBeenCalled();
  });

  it("only adds URLs after HTTP evidence; wildcard URLs use the real hostname", async () => {
    const data = fixture();
    data.process(42);
    data.texts.set(`${proc}/net/tcp`, `${header}\n${row("123", "00000000")}\n`);
    data.probe.mockResolvedValue(true);
    const result = await data.discover()(root, signal());
    expect(data.probe).toHaveBeenCalledWith("127.0.0.1", 5173, expect.any(AbortSignal));
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
    expect(result).toEqual({ scan: { status: "partial", message: "Node discovery reached its time limit" }, servers: [] });
  });

  it("probes a real local HTTP listener but does not invent HTTP for a raw TCP socket", async () => {
    const http = createHttpServer((request, response) => { expect(request.method).toBe("HEAD"); response.writeHead(204); response.end(); });
    const tcp = createTcpServer((socket) => { socket.on("data", () => socket.end("not http")); });
    await Promise.all([new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve)), new Promise<void>((resolve) => tcp.listen(0, "127.0.0.1", resolve))]);
    try {
      const result = await discoverNodeServers(process.cwd(), signal());
      const server = result.servers.find((entry) => entry.pid === process.pid);
      const httpPort = (http.address() as { port: number }).port;
      const tcpPort = (tcp.address() as { port: number }).port;
      expect(server?.endpoints.find((endpoint) => endpoint.port === httpPort)?.url).toBe(`http://localhost:${httpPort}/`);
      expect(server?.endpoints.find((endpoint) => endpoint.port === tcpPort)).toMatchObject({ protocol: "tcp", address: "127.0.0.1" });
      expect(server?.endpoints.find((endpoint) => endpoint.port === tcpPort)?.url).toBeUndefined();
    } finally {
      await Promise.all([new Promise<void>((resolve) => http.close(() => resolve())), new Promise<void>((resolve) => tcp.close(() => resolve()))]);
    }
  });
});
