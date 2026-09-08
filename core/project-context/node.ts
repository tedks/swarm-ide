import { constants } from "node:fs";
import { open, opendir, readlink, realpath } from "node:fs/promises";
import { request } from "node:http";
import { endianness, hostname } from "node:os";
import { basename, isAbsolute, join, relative } from "node:path";
import type { ProjectEndpoint, ProjectScan, ProjectServer } from "../../protocol/project-context";

type Result = { scan: ProjectScan; servers: ProjectServer[] };
type Listing = { names: string[]; truncated: boolean };
export interface NodeDiscoveryIO {
  read(path: string, limit: number, signal: AbortSignal): Promise<string>;
  list(path: string, limit: number, signal: AbortSignal): Promise<Listing>;
  link(path: string): Promise<string>;
  real(path: string): Promise<string>;
}
export interface NodeDiscoveryOptions {
  io?: NodeDiscoveryIO;
  procRoot?: string;
  hostname?: string;
  timeoutMs?: number;
  probe?: (address: string, port: number, signal: AbortSignal, authority: string) => Promise<boolean>;
}

function cancelled(): Error { return Object.assign(new Error("Node discovery cancelled"), { name: "AbortError" }); }
function check(signal: AbortSignal): void { if (signal.aborted) throw cancelled(); }
function missing(error: unknown): boolean { return ["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException)?.code ?? ""); }
function contained(root: string, path: string): boolean {
  const suffix = relative(root, path);
  return isAbsolute(path) && !isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith("../");
}
function displayable(value: string): boolean { return value.length > 0 && value.length <= 512 && !/[\x00-\x1f\x7f]/.test(value); }

const nativeIO: NodeDiscoveryIO = {
  async read(path, limit, signal) {
    check(signal);
    // Do not follow a substituted final symlink or block on a FIFO. Proc files report size zero.
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const buffer = Buffer.alloc(limit + 1);
      let length = 0;
      while (length <= limit) {
        check(signal);
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
        if (!bytesRead) return buffer.subarray(0, length).toString("utf8");
        length += bytesRead;
      }
      throw new Error("Proc file exceeds observation bound");
    } finally { await file.close(); }
  },
  async list(path, limit, signal) {
    const directory = await opendir(path);
    const names: string[] = [];
    try {
      for await (const entry of directory) {
        check(signal);
        if (names.length === limit) return { names, truncated: true };
        names.push(entry.name);
      }
      return { names, truncated: false };
    } finally { await directory.close().catch(() => {}); }
  },
  link: readlink,
  real: realpath,
};

type Listener = ProjectEndpoint & { inode: string };
/** Linux prints IPv4 and each IPv6 32-bit word in host byte order. */
export function parseNodeListeners(text: string, ipv6 = false): { listeners: Listener[]; partial: boolean } {
  const listeners: Listener[] = [];
  let partial = false;
  const rows = text.split("\n");
  if (!/^\s*sl\s+local_address\s+rem(?:ote)?_address\s+st\s/.test(rows[0] ?? "")) return { listeners, partial: true };
  for (const row of rows.slice(1, 4097)) {
    if (!row.trim()) continue;
    const fields = row.trim().split(/\s+/);
    if (fields.length < 10 || !/^\d+:$/.test(fields[0]!) || !/^[0-9A-F]{2}$/i.test(fields[3]!)) { partial = true; continue; }
    if (fields[3]!.toUpperCase() !== "0A") continue;
    const local = new RegExp(`^([0-9A-F]{${ipv6 ? 32 : 8}}):([0-9A-F]{4})$`, "i").exec(fields[1]!);
    if (!local || !/^\d+$/.test(fields[9]!) || /^0+$/.test(fields[9]!)) { partial = true; continue; }
    const port = Number.parseInt(local[2]!, 16);
    if (!port) { partial = true; continue; }
    const bytes = Buffer.from(local[1]!, "hex");
    if (endianness() === "LE") for (let offset = 0; offset < bytes.length; offset += 4) bytes.subarray(offset, offset + 4).reverse();
    const address = ipv6
      ? Array.from({ length: 8 }, (_, index) => bytes.readUInt16BE(index * 2).toString(16)).join(":")
      : [...bytes].join(".");
    listeners.push({ inode: fields[9]!, address, port, protocol: "tcp" });
  }
  if (rows.length > 4098) partial = true;
  return { listeners, partial };
}

function loopback(address: string): boolean {
  // Other 127/8 addresses need their literal address: localhost may not reach that bind.
  return address === "127.0.0.1" || address === "0:0:0:0:0:0:0:1" || address === "0:0:0:0:0:ffff:7f00:1";
}
function wildcard(address: string): boolean { return address === "0.0.0.0" || address === "0:0:0:0:0:0:0:0"; }
function connectAddress(address: string): string {
  return wildcard(address) ? (address.includes(":") ? "::1" : "127.0.0.1") : address;
}
function webUrl(endpoint: ProjectEndpoint, machine: string): string | undefined {
  const host = wildcard(endpoint.address) ? machine : loopback(endpoint.address) ? "localhost" : endpoint.address;
  if (!host || !/^[a-zA-Z0-9.:-]+$/.test(host) || host === "0.0.0.0") return undefined;
  try { return new URL(`http://${host.includes(":") ? `[${host}]` : host}:${endpoint.port}/`).href; }
  catch { return undefined; }
}

/** HEAD with the displayed URL's Host, but a numeric socket destination: no DNS, credentials, redirects, or body collection. */
async function probeHttp(address: string, port: number, signal: AbortSignal, authority: string): Promise<boolean> {
  check(signal);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outgoing.destroy();
      resolve(value);
    };
    const outgoing = request({ hostname: address, port, method: "HEAD", path: "/", agent: false,
      signal, maxHeaderSize: 8192, headers: { Connection: "close", Host: authority } }, (response) => {
      // A rejected Host or error response proves HTTP exists, not that this is a usable link.
      // Redirect destinations are not followed or presented as verified URLs either.
      finish(response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300);
      response.destroy();
    });
    const timer = setTimeout(() => finish(false), 150);
    outgoing.once("error", () => finish(false));
    outgoing.end();
  });
}

type Identity = { start: string; executable: string; cwd: string };
type Alias = { name: string; target: string; execroot: string };

/** Injectable OS boundary for deterministic tests; callers normally use discoverNodeServers. */
export function createNodeServerDiscovery(options: NodeDiscoveryOptions = {}) {
  const io = options.io ?? nativeIO;
  const proc = options.procRoot ?? "/proc";
  const machine = options.hostname ?? hostname();
  const probe = options.probe ?? probeHttp;
  return async (root: string, signal: AbortSignal): Promise<Result> => {
    check(signal);
    const controller = new AbortController();
    const stop = () => controller.abort();
    signal.addEventListener("abort", stop, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const servers: ProjectServer[] = [];
    let partial = false;
    const deadline = new Promise<Result>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ scan: { status: "partial", message: "Node discovery reached its time limit" }, servers: [...servers] });
      }, Math.max(1, Math.min(options.timeoutMs ?? 2200, 10_000)));
    });
    let abortListener: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      abortListener = () => reject(cancelled());
      signal.addEventListener("abort", abortListener, { once: true });
      if (signal.aborted) abortListener();
    });
    const active = controller.signal;

    async function identity(pid: string): Promise<Identity | undefined> {
      check(active);
      const base = join(proc, pid);
      const executable = await io.link(join(base, "exe"));
      if (!["node", "nodejs"].includes(basename(executable))) return undefined;
      const stat = await io.read(join(base, "stat"), 4096, active);
      const end = stat.lastIndexOf(") ");
      const start = stat.slice(end + 2).trim().split(/\s+/)[19];
      if (!stat.startsWith(`${pid} (`) || end < 0 || !start || !/^\d+$/.test(start)) throw new Error("Malformed process identity");
      const cwd = await io.link(join(base, "cwd"));
      if (!isAbsolute(cwd) || cwd.endsWith(" (deleted)") || !displayable(cwd)) throw new Error("Unsupported process directory");
      return { executable, start, cwd };
    }
    async function aliases(rootPath: string): Promise<Alias[]> {
      const result: Alias[] = [];
      for (const name of ["bazel-bin", "bazel-out"]) {
        try {
          await io.link(join(rootPath, name)); // Only the two exact symlinks, never arbitrary repository links.
          const target = await io.real(join(rootPath, name));
          const match = /^(.*\/execroot\/[^/]+)\/bazel-out(?:\/.*)?$/.exec(target);
          if (match) result.push({ name, target, execroot: match[1]! });
        } catch (error) { if (!missing(error) && (error as NodeJS.ErrnoException).code !== "EINVAL") partial = true; }
      }
      return result;
    }
    async function association(cwd: string, rootPath: string, outputs: Alias[]): Promise<ProjectServer["association"] | undefined> {
      if (contained(rootPath, cwd)) return "worktree";
      for (const alias of outputs) {
        if (!contained(alias.target, cwd)) continue;
        // A backlink from the generated package to this checkout prevents a link to another worktree's output claiming it.
        const suffix = relative(alias.target, cwd);
        const runfiles = /(?:^|\/)[^/]+\.runfiles\/[^/]+\/(.+)$/.exec(suffix);
        const source = runfiles?.[1] ?? suffix;
        if (!source || source.split("/").some((part) => part === ".." || part === ".")) continue;
        try {
          if (await io.real(join(rootPath, alias.name)) !== alias.target) continue;
          if (contained(rootPath, await io.real(join(alias.execroot, source)))) return "bazel-output";
        } catch (error) { if (!missing(error)) partial = true; }
      }
      return undefined;
    }
    async function listeners(): Promise<Map<string, Listener>> {
      const result = new Map<string, Listener>();
      let readable = false;
      for (const table of ["tcp", "tcp6"]) {
        try {
          const parsed = parseNodeListeners(await io.read(join(proc, "net", table), 1024 * 1024, active), table === "tcp6");
          partial ||= parsed.partial;
          readable = true;
          for (const listener of parsed.listeners) result.set(listener.inode, listener);
        } catch { check(active); partial = true; }
      }
      if (!readable) throw new Error("Listener metadata unavailable");
      return result;
    }
    async function scan(): Promise<Result> {
      try {
        const rootPath = await io.real(root);
        const outputs = await aliases(rootPath);
        const table = await listeners();
        const processes = await io.list(proc, 4096, active);
        partial ||= processes.truncated;
        let probes = 0;
        for (const pid of processes.names.filter((name) => /^[1-9]\d{0,9}$/.test(name)).sort((a, b) => Number(a) - Number(b))) {
          check(active);
          if (servers.length === 32) { partial = true; break; }
          try {
            const before = await identity(pid);
            if (!before) continue;
            const relation = await association(before.cwd, rootPath, outputs);
            if (!relation) continue;
            const fds = await io.list(join(proc, pid, "fd"), 1024, active);
            partial ||= fds.truncated;
            const owned: Array<{ fd: string; listener: Listener }> = [];
            const seen = new Set<string>();
            for (const fd of fds.names.filter((name) => /^\d+$/.test(name))) {
              check(active);
              try {
                const socket = /^socket:\[(\d+)\]$/.exec(await io.link(join(proc, pid, "fd", fd)));
                const listener = socket && table.get(socket[1]!);
                if (listener && !seen.has(listener.inode)) {
                  if (owned.length === 16) { partial = true; break; }
                  seen.add(listener.inode);
                  owned.push({ fd, listener });
                }
              } catch (error) { if (!missing(error)) partial = true; }
            }
            if (!owned.length) continue;
            const middle = await identity(pid);
            if (!middle || JSON.stringify(before) !== JSON.stringify(middle)) { partial = true; continue; }
            const endpoints: ProjectEndpoint[] = [];
            for (const { fd, listener } of owned) {
              check(active);
              const { inode, ...endpoint } = listener;
              const url = webUrl(endpoint, machine);
              if (url && probes < 32) {
                probes++;
                if (await probe(connectAddress(endpoint.address), endpoint.port, active, new URL(url).host).catch(() => false)) {
                  endpoint.url = url;
                }
              } else if (url) partial = true;
              check(active);
              if (await io.link(join(proc, pid, "fd", fd)) === `socket:[${inode}]`) endpoints.push(endpoint);
              else partial = true;
            }
            const after = await identity(pid);
            if (!after || JSON.stringify(before) !== JSON.stringify(after)
              || await association(after.cwd, rootPath, outputs) !== relation) { partial = true; continue; }
            check(active);
            if (endpoints.length) servers.push({ pid: Number(pid), name: "Node.js", directory: after.cwd, association: relation, endpoints });
          } catch (error) { check(active); if (!missing(error)) partial = true; }
        }
        return { scan: partial ? { status: "partial", message: "Some process, listener, or HTTP metadata was inaccessible or exceeded its bound" } : { status: "observed" }, servers: [...servers] };
      } catch { check(active); return { scan: { status: "unavailable", message: "Local process or listener metadata is unavailable" }, servers: [] }; }
    }
    try { return await Promise.race([scan(), deadline, aborted]); }
    finally {
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      if (abortListener) signal.removeEventListener("abort", abortListener);
      controller.abort();
    }
  };
}

export async function discoverNodeServers(root: string, signal: AbortSignal): Promise<Result> {
  return createNodeServerDiscovery()(root, signal);
}
