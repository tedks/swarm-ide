import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { isIP } from "node:net";
import { delimiter, isAbsolute, join, relative, sep } from "node:path";
import { z } from "zod";
import { ProjectContainerSchema, type ProjectContainer, type ProjectEndpoint, type ProjectScan } from "../../protocol/project-context";

const LIMIT = 32, MAX_ROWS = 256, MAX_BYTES = 256 * 1024;
const fields = (names: Record<string, string>) => `{${Object.entries(names).map(([key, value]) => `"${key}":{{json ${value}}}`).join(",")}}`;
const LIST_FORMAT = fields({ id: ".ID", name: ".Names", image: ".Image", state: ".State", status: ".Status", ports: ".Ports",
  directory: '( .Label "com.docker.compose.project.working_dir" )', service: '( .Label "com.docker.compose.service" )' });
const STATS_FORMAT = fields({ id: ".ID", cpu: ".CPUPerc", memory: ".MemUsage" });
const clean = z.string().max(512).refine((value) => !/[\x00-\x1f\x7f]/.test(value));
const identifier = z.string().regex(/^[a-f0-9]{64}$/);
const Row = z.object({ id: identifier, name: z.string().min(1).pipe(clean), image: z.string().min(1).pipe(clean),
  state: z.enum(["created", "restarting", "running", "removing", "paused", "exited", "dead"]),
  status: clean, ports: z.string().max(16 * 1024), directory: clean, service: clean }).strict();
const Stats = z.object({ id: identifier, cpu: clean, memory: clean }).strict();
export type DockerCommand = (args: string[], signal: AbortSignal) => Promise<string>;

function contains(root: string, path: string): boolean {
  const local = relative(root, path);
  return local === "" || (!isAbsolute(local) && local !== ".." && !local.startsWith(`..${sep}`));
}
function cancelled(signal: AbortSignal): void { if (signal.aborted) throw new Error("Cancelled"); }

let nativeMetadataPending = false;
/** A cancelled NFS/FUSE read may still occupy a native filesystem worker. Keep
 * admission closed until that read settles, so refreshes cannot accumulate it. */
export function readDockerFilesystem<T>(read: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error("Cancelled")); return; }
    if (nativeMetadataPending) { reject(new Error("Previous Docker metadata read is still pending")); return; }
    nativeMetadataPending = true;
    const clean = () => signal.removeEventListener("abort", abort);
    const abort = () => { clean(); reject(new Error("Cancelled")); };
    signal.addEventListener("abort", abort, { once: true });
    try { read().then((value) => { nativeMetadataPending = false; clean(); resolve(value); }, (error) => { nativeMetadataPending = false; clean(); reject(error); }); }
    catch (error) { nativeMetadataPending = false; clean(); reject(error); }
  });
}

/** Resolve an installed CLI, never a relative PATH entry or this repository's executable. */
async function installedDocker(root: string, signal: AbortSignal): Promise<string> {
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(isAbsolute)) {
    cancelled(signal);
    try {
      const candidate = await readDockerFilesystem(() => realpath(join(directory, "docker")), signal);
      if (contains(root, candidate) || !(await readDockerFilesystem(() => stat(candidate), signal)).isFile()) continue;
      await readDockerFilesystem(() => access(candidate, constants.X_OK), signal);
      return candidate;
    } catch { cancelled(signal); /* Try the next installed-tool directory. */ }
  }
  throw new Error("Docker unavailable");
}

function command(executable: string): DockerCommand {
  return (args, signal) => new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error("Cancelled")); return; }
    // No shell, repository cwd, startup hooks, output of environments or raw errors.
    const env: NodeJS.ProcessEnv = { LANG: "C", LC_ALL: "C" };
    for (const key of ["HOME", "PATH", "XDG_RUNTIME_DIR", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "DOCKER_API_VERSION", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    if (args[0] === "--host") {
      // The verified endpoint is explicit. Neither environment overrides nor a
      // concurrent `docker context use` may change the daemon for these reads.
      delete env.DOCKER_CONTEXT;
      delete env.DOCKER_HOST;
    }
    let result: { error: Error | null; output: string } | undefined;
    const child = execFile(executable, args, { cwd: "/", env, encoding: "utf8", signal,
      timeout: 3000, killSignal: "SIGKILL", maxBuffer: MAX_BYTES },
    (error, output) => { result = { error, output }; });
    // Abort can invoke the callback before close. Do not leave our CLI alive on return.
    child.once("close", () => {
      if (!result || result.error || signal.aborted) reject(new Error("Docker read unavailable"));
      else resolve(result.output);
    });
  });
}

function rows(output: string): { lines: string[]; limited: boolean } {
  if (Buffer.byteLength(output) > MAX_BYTES) throw new Error("Docker output exceeded bound");
  const lines = output.split("\n").filter((line) => line.trim());
  return { lines: lines.slice(0, MAX_ROWS), limited: lines.length > MAX_ROWS };
}
function parsed<T>(schema: z.ZodType<T>, line: string): T | undefined {
  try { const result = schema.safeParse(JSON.parse(line)); return result.success ? result.data : undefined; }
  catch { return undefined; }
}

/** Only published bindings are host endpoints; exposed container ports are not. */
function endpoints(value: string): { endpoints: ProjectEndpoint[]; partial: boolean } {
  const result: ProjectEndpoint[] = [];
  let partial = false;
  for (const item of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    if (/^\d+(?:-\d+)?\/(tcp|udp|sctp)$/.test(item)) continue;
    const match = /^(\[[^\]]+\]|[^:\s]+):(\d+)(?:-(\d+))?->(\d+)(?:-(\d+))?\/(tcp|udp)$/.exec(item);
    if (!match) { partial = true; continue; }
    const address = match[1].replace(/^\[|\]$/g, ""), first = Number(match[2]), last = Number(match[3] ?? match[2]);
    const targetFirst = Number(match[4]), targetLast = Number(match[5] ?? match[4]);
    if (!isIP(address) || first < 1 || last > 65535 || first > last || targetFirst < 1 || targetLast > 65535 ||
        targetFirst > targetLast || last - first !== targetLast - targetFirst) { partial = true; continue; }
    for (let port = first; port <= last; port++) {
      if (result.length === 16) { partial = true; break; }
      const protocol = match[6] as "tcp" | "udp";
      if (!result.some((entry) => entry.address === address && entry.port === port && entry.protocol === protocol)) result.push({ address, port, protocol });
    }
  }
  return { endpoints: result, partial };
}

function bytes(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*(B|kB|KB|MB|GB|TB|PB|KiB|MiB|GiB|TiB|PiB)$/.exec(value.trim());
  if (!match) return undefined;
  const powers: Record<string, number> = { B: 1, kB: 1e3, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, PB: 1e15,
    KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4, PiB: 1024 ** 5 };
  const result = Number(match[1]) * powers[match[2]];
  return Number.isFinite(result) && result <= Number.MAX_SAFE_INTEGER ? Math.round(result) : undefined;
}

/** Local-daemon observation, not a liveness probe or permission to control containers.
 * Compose paths are ownership evidence, never basename/project-name guesses. The
 * optional command seam makes this read-only boundary testable without live Docker. */
export async function discoverDockerContainers(root: string, signal: AbortSignal, run?: DockerCommand): Promise<{ scan: ProjectScan; containers: ProjectContainer[] }> {
  const unavailable = (message: string) => ({ scan: { status: "unavailable" as const, message }, containers: [] });
  try {
    cancelled(signal);
    const canonicalRoot = await readDockerFilesystem(() => realpath(root), signal);
    const execute = run ?? command(await installedDocker(canonicalRoot, signal));
    cancelled(signal);
    // DOCKER_CONTEXT overrides DOCKER_HOST. Context inspection only reads endpoint
    // metadata; never connect to a remote engine and treat its paths as local ones.
    const endpoint = process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT ? process.env.DOCKER_HOST :
      (await execute(["context", "inspect", "--format", '{{with index .Endpoints "docker"}}{{.Host}}{{end}}'], signal)).trim();
    if (!/^unix:\/\/\//.test(endpoint)) return unavailable("Only a local Docker socket can establish worktree ownership");
    cancelled(signal);
    const listed = rows(await execute(["--host", endpoint, "ps", "--all", "--no-trunc", "--filter", "label=com.docker.compose.project.working_dir", "--format", LIST_FORMAT], signal));
    const containers: ProjectContainer[] = [];
    let partial = listed.limited;
    const seen = new Set<string>();
    for (const line of listed.lines) {
      cancelled(signal);
      const row = parsed(Row, line);
      if (!row) { partial = true; continue; }
      if (!isAbsolute(row.directory)) continue;
      let directory: string;
      try { directory = await readDockerFilesystem(() => realpath(row.directory), signal); } catch { cancelled(signal); continue; }
      if (!contains(canonicalRoot, directory)) continue;
      if (seen.has(row.id)) { partial = true; continue; }
      if (containers.length === LIMIT) { partial = true; break; }
      seen.add(row.id);
      const ports = endpoints(row.ports);
      partial ||= ports.partial;
      const health = /\((healthy|unhealthy)\)/.exec(row.status)?.[1] ?? (/\(health: starting\)/.test(row.status) ? "starting" : undefined);
      const candidate = ProjectContainerSchema.safeParse({ id: row.id, name: row.name, image: row.image, state: row.state,
        health, ...(row.service ? { service: row.service } : {}), directory, endpoints: ports.endpoints });
      if (candidate.success) containers.push(candidate.data); else partial = true;
    }
    const running = containers.filter((container) => container.state === "running");
    if (running.length) {
      try {
        const samples = rows(await execute(["--host", endpoint, "stats", "--no-stream", "--no-trunc", "--format", STATS_FORMAT, "--", ...running.map((container) => container.id)], signal));
        partial ||= samples.limited;
        const sampled = new Set<string>();
        for (const line of samples.lines) {
          const sample = parsed(Stats, line), container = sample && running.find((entry) => entry.id === sample.id);
          if (!sample || !container || sampled.has(sample.id)) { partial = true; continue; }
          sampled.add(sample.id);
          const cpu = /^(\d+(?:\.\d+)?)%$/.exec(sample.cpu);
          if (cpu && Number.isFinite(Number(cpu[1]))) container.cpuPercent = Number(cpu[1]); else partial = true;
          const memory = sample.memory.split("/");
          const used = memory.length === 2 ? bytes(memory[0]) : undefined, limit = memory.length === 2 ? bytes(memory[1]) : undefined;
          if (used !== undefined && limit !== undefined) { container.memoryBytes = used; container.memoryLimitBytes = limit; } else partial = true;
        }
        if (sampled.size !== running.length) partial = true;
      } catch { partial = true; }
    }
    cancelled(signal);
    if (await readDockerFilesystem(() => realpath(root), signal) !== canonicalRoot) return unavailable("Worktree moved during the container scan");
    cancelled(signal);
    return { scan: { status: partial ? "partial" : "observed",
      ...(partial ? { message: "Some container details were unavailable or exceeded the scan limit" } :
        containers.length ? {} : { message: "No containers with verified Compose worktree ownership" }) }, containers };
  } catch { return unavailable(signal.aborted ? "Container scan cancelled" : "Docker or its local socket is unavailable"); }
}
