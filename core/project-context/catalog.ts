import { constants, type Dirent } from "node:fs";
import { open, opendir, realpath, type FileHandle } from "node:fs/promises";
import { basename, isAbsolute, join, posix, relative } from "node:path";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { ProjectCatalogSchema, ProjectComponentSchema, ProjectSiteSchema,
  type ProjectCatalog, type ProjectComponent, type ProjectRelationship } from "../../protocol/project-context";

const MAX_BYTES = 256 * 1024, MAX_FILES = 128, MAX_DIRS = 256, MAX_DEPTH = 6, MAX_ENTRIES = 8192;
const excluded = new Set(["node_modules", "vendor", "build", "dist", "target", "coverage", "out", "__pycache__", "venv", "env", "site-packages", "fixtures", "__fixtures__", "testdata"]);
const names = new Set(["package.json", "pnpm-workspace.yaml", "pyproject.toml", "requirements.txt", "hugo.toml", "config.toml", "Move.toml", "dune-project", "MODULE.bazel", "WORKSPACE", "WORKSPACE.bazel"]);
const nodeFrameworks: Record<string, string> = { react: "React", next: "Next.js", vite: "Vite", vue: "Vue", svelte: "Svelte", "@sveltejs/kit": "SvelteKit", astro: "Astro", nuxt: "Nuxt", express: "Express", fastify: "Fastify", "@nestjs/core": "NestJS", electron: "Electron", typescript: "TypeScript", vitest: "Vitest", "@playwright/test": "Playwright", jest: "Jest", "@mysten/sui": "Sui", "@mysten/seal": "SEAL", "@mysten/walrus": "Walrus" };
const pythonFrameworks: Record<string, string> = { django: "Django", flask: "Flask", fastapi: "FastAPI", uvicorn: "Uvicorn", pytest: "pytest", pydantic: "Pydantic", numpy: "NumPy", pandas: "pandas", torch: "PyTorch", tensorflow: "TensorFlow", sqlalchemy: "SQLAlchemy" };
const safe = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\x00-\x1f\x7f]/.test(value);
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
function check(signal: AbortSignal): void { if (signal.aborted) throw new Error("Catalog stopped"); }
function inside(root: string, path: string): boolean {
  const suffix = relative(root, path);
  return !isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith("../");
}
type Declaration = { component: ProjectComponent; dependencies: [string, string][]; workspaces: string[]; workspaceEvidence: string };
type Manifest = { path: string; text: string };
let pendingWalk: Promise<ProjectCatalog> | undefined;
export interface CatalogDiscoveryOptions {
  /** Test-only filesystem scheduling seam; production performs the native walk. */
  beforeWalk?: () => Promise<void>;
  timeoutMs?: number;
}

/** Literal TOML subset: strings, string arrays, and inline tables. No evaluation,
 * interpolation, imports, or dependency URL output. Unsupported selected values
 * are omitted and reported as partial instead of being guessed. */
function literal(value: string): string | undefined {
  const text = value.trim();
  if (/^'[^'\r\n]*'$/.test(text)) return text.slice(1, -1);
  if (!/^"(?:[^"\\\r\n]|\\.)*"$/.test(text)) return undefined;
  try { const result: unknown = JSON.parse(text); return typeof result === "string" ? result : undefined; } catch { return undefined; }
}
function splitLiteral(value: string, separator: string): string[] | undefined {
  const parts: string[] = []; let quote = "", escaped = false, start = 0, depth = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote) { if (escaped) escaped = false; else if (char === "\\" && quote === '"') escaped = true; else if (char === quote) quote = ""; continue; }
    if (char === '"' || char === "'") quote = char;
    else if (char === "[" || char === "{") depth++;
    else if (char === "]" || char === "}") { if (--depth < 0) return undefined; }
    else if (char === separator && depth === 0) { parts.push(value.slice(start, i).trim()); start = i + 1; }
  }
  return quote || depth ? undefined : [...parts, value.slice(start).trim()];
}
function strings(value: string): string[] | undefined {
  if (!value.startsWith("[") || !value.endsWith("]")) return undefined;
  const parts = splitLiteral(value.slice(1, -1), ",");
  if (!parts) return undefined;
  const values = parts.filter(Boolean).map(literal);
  return values.every((entry) => entry !== undefined) ? values as string[] : undefined;
}
function tableField(value: string, field: string): string | undefined {
  if (!value.startsWith("{") || !value.endsWith("}")) return undefined;
  const parts = splitLiteral(value.slice(1, -1), ",");
  if (!parts) return undefined;
  const entries = parts.map((part) => /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/s.exec(part));
  if (entries.some((entry) => !entry)) return undefined;
  const matches = entries.filter((entry) => entry![1] === field);
  return matches.length === 1 ? literal(matches[0]![2]) : undefined;
}
/** Inspect YAML nodes without converting or resolving aliases. Membership must
 * be one complete literal list; exclusions/unsupported globs invalidate the list
 * rather than being dropped while their broader positive patterns survive. */
function pnpmPackages(text: string): string[] | undefined {
  try {
    const document = parseDocument(text, { schema: "core", merge: false, uniqueKeys: true, stringKeys: true, prettyErrors: false, logLevel: "silent" });
    if (document.errors.length || document.warnings.length || !isMap(document.contents) || document.contents.has("<<")) return undefined;
    const packages = document.get("packages", true);
    if (!isSeq(packages) || packages.anchor || packages.tag || packages.items.length > 24) return undefined;
    const patterns: string[] = [];
    for (const item of packages.items) {
      if (!isScalar(item) || item.anchor || item.tag || item.type === "BLOCK_FOLDED" || item.type === "BLOCK_LITERAL" || !safe(item.value)) return undefined;
      const pattern = item.value;
      if (pattern.startsWith("/") || /[!{}()[\]\\?]/.test(pattern)) return undefined;
      const parts = pattern.replace(/^\.\//, "").replace(/\/$/, "").split("/");
      if (parts.some((part) => !part || part === ".." || (part.includes("*") && part !== "*" && part !== "**"))) return undefined;
      patterns.push(pattern);
    }
    return patterns;
  } catch { return undefined; }
}
function toml(text: string): { entries: Map<string, string>; partial: boolean } {
  const entries = new Map<string, string>(); let section = "", pending = "", pendingLines = 0, partial = false;
  for (const original of text.split(/\r?\n/)) {
    // Strip comments only outside quoted strings.
    let line = "", quote = "", escaped = false;
    for (const char of original) {
      if (!quote && char === "#") break;
      line += char;
      if (quote) { if (escaped) escaped = false; else if (quote === '"' && char === "\\") escaped = true; else if (char === quote) quote = ""; }
      else if (char === '"' || char === "'") quote = char;
    }
    line = line.trim(); if (!line) continue;
    // Bound rescanning a multiline logical statement, including malformed input.
    // A 256KiB file of tiny unterminated lines must remain linear in file size.
    if (pending && (++pendingLines > 64 || pending.length + line.length > 16 * 1024)) return { entries, partial: true };
    if (pending) line = `${pending} ${line}`;
    if (line.length > 16 * 1024) return { entries, partial: true };
    if (!splitLiteral(line, "\0")) { pending = line; continue; }
    pending = ""; pendingLines = 0;
    const header = /^\[([A-Za-z0-9_.-]+)\]$/.exec(line);
    if (header) { section = header[1]; continue; }
    if (line.startsWith("[")) { section = "unsupported"; partial = true; continue; }
    const assignment = /^([A-Za-z0-9_.-]+|"(?:[^"\\]|\\.)*"|'[^']*')\s*=\s*(.+)$/.exec(line);
    if (!assignment) { partial = true; continue; }
    const key = literal(assignment[1]) ?? assignment[1], full = `${section}\0${key}`;
    if (entries.has(full)) { entries.delete(full); partial = true; continue; }
    entries.set(full, assignment[2]);
  }
  return { entries, partial: partial || Boolean(pending) };
}
function workflow(name: string): ProjectComponent["workflows"][number] {
  const terms = name.toLowerCase().split(/[:_\-]/);
  const has = (...values: string[]) => terms.some((term) => values.includes(term));
  const kind = has("deploy", "publish") ? "deploy" : has("test", "tests", "e2e", "lint", "check", "typecheck", "verify") ? "test" :
    has("build", "compile", "bundle") ? "build" : has("dev", "develop", "start", "serve", "watch") ? "develop" : "other";
  return { name, kind };
}
function pathToManifest(source: string, value: string, file: string): string | undefined {
  if (!safe(value) || isAbsolute(value) || value.includes("\\") || /[?#]/.test(value)) return undefined;
  const target = posix.normalize(posix.join(posix.dirname(source), value, file));
  return target !== ".." && !target.startsWith("../") ? target : undefined;
}
function workspaceMatch(pattern: string, path: string): boolean {
  if (!path || path === ".." || path.startsWith("../") || path.startsWith("/") || path.split("/").includes("..")) return false;
  if (!safe(pattern) || pattern.startsWith("/") || /[!{}()[\]\\?]/.test(pattern)) return false;
  const parts = pattern.replace(/^\.\//, "").replace(/\/$/, "").split("/"), target = path.split("/");
  if (parts.some((part) => !part || part === ".." || (part.includes("*") && part !== "*" && part !== "**"))) return false;
  // Segment-state matching avoids backtracking regexes supplied by a manifest.
  let positions = new Set([0]);
  for (const part of parts) {
    const next = new Set<number>();
    for (const index of positions) {
      if (part === "**") for (let end = index; end <= target.length; end++) next.add(end);
      else if (index < target.length && (part === "*" || part === target[index])) next.add(index + 1);
    }
    positions = next;
  }
  return positions.has(target.length);
}

export async function discoverProjectCatalog(root: string, signal: AbortSignal, options: CatalogDiscoveryOptions = {}): Promise<ProjectCatalog> {
  // A deadline cannot cancel a native NFS/FUSE operation. Keep its admission
  // occupied until the original walk and handle cleanup actually settle.
  if (pendingWalk) return { scan: { status: "unavailable", message: "A previous catalog filesystem read is still finishing" }, components: [], relationships: [], sites: [] };
  const components: ProjectComponent[] = [], relationships: ProjectRelationship[] = [], sites: ProjectCatalog["sites"] = [];
  let partial = false, canonicalRoot = "";
  const controller = new AbortController(), active = controller.signal;
  const result = (status: ProjectCatalog["scan"]["status"], message?: string): ProjectCatalog => ({
    scan: { status, ...(message ? { message } : {}) }, components: [...components], relationships: [...relationships], sites: [...sites],
  });
  const incomplete = (message: string) => result(components.length || relationships.length || sites.length ? "partial" : "unavailable", message);
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, Math.max(1, Math.min(1500, options.timeoutMs ?? 1500)));
  const stopped = new Promise<ProjectCatalog>((resolve) => {
    const finish = () => resolve(signal.aborted ? { scan: { status: "unavailable", message: "Catalog scan cancelled" }, components: [], relationships: [], sites: [] } : incomplete("Catalog scan reached its time limit"));
    active.addEventListener("abort", finish, { once: true }); if (active.aborted) finish();
  });
  const work = async (): Promise<ProjectCatalog> => {
    if (options.beforeWalk) { check(active); await options.beforeWalk(); }
    check(active); canonicalRoot = await realpath(root); check(active);
    const manifests: Manifest[] = [], pnpmDirectories = new Set<string>(); let directories = 0, entries = 0, files = 0;
    async function readManifest(path: string, parent: FileHandle, name: string): Promise<void> {
      check(active);
      if (files === MAX_FILES) { partial = true; return; }
      files++;
      // Descriptor-relative traversal keeps an ancestor symlink swap from opening
      // outside data. NOFOLLOW and NONBLOCK reject links and never wait on FIFOs.
      const file = await open(`/proc/self/fd/${parent.fd}/${name}`, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        check(active); const before = await file.stat(); check(active);
        const actual = await realpath(`/proc/self/fd/${file.fd}`); check(active);
        if (!before.isFile() || before.size > MAX_BYTES || actual !== join(canonicalRoot, path)) { partial = true; return; }
        const buffer = Buffer.alloc(MAX_BYTES + 1); let length = 0;
        while (length <= MAX_BYTES) {
          check(active); const chunk = await file.read(buffer, length, buffer.length - length, null); check(active);
          if (!chunk.bytesRead) break; length += chunk.bytesRead;
        }
        const after = await file.stat(); check(active);
        if (length > MAX_BYTES || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) { partial = true; return; }
        manifests.push({ path, text: new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length)) });
      } finally { await file.close(); }
    }
    async function walk(path: string, depth: number, parent?: FileHandle, name?: string): Promise<void> {
      check(active);
      if (directories === MAX_DIRS || entries === MAX_ENTRIES) { partial = true; return; }
      const file = await open(parent ? `/proc/self/fd/${parent.fd}/${name}` : canonicalRoot,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        check(active); const actual = await realpath(`/proc/self/fd/${file.fd}`); check(active);
        if (actual !== join(canonicalRoot, path) || !inside(canonicalRoot, actual)) { partial = true; return; }
        directories++;
        const dir = await opendir(`/proc/self/fd/${file.fd}`);
        const children: Dirent[] = [];
        try {
          while (true) {
            check(active); const entry = await dir.read(); check(active);
            if (!entry) break;
            if (++entries > MAX_ENTRIES) { entries = MAX_ENTRIES; partial = true; break; }
            if (entry.name.startsWith(".") || excluded.has(entry.name) || entry.name.startsWith("bazel-")) continue;
            if (!safe(entry.name) || entry.name.includes("\\")) { partial = true; continue; }
            children.push(entry);
          }
        } finally { await dir.close(); }
        const hugoLayout = children.filter((entry) => entry.isDirectory() && ["content", "layouts", "themes", "archetypes"].includes(entry.name)).length >= 2;
        children.sort((a, b) => a.name.localeCompare(b.name));
        for (const child of children) {
          check(active); if (!names.has(child.name) || (child.name === "config.toml" && !hugoLayout)) continue;
          if (child.name === "pnpm-workspace.yaml") pnpmDirectories.add(path || ".");
          if (!child.isFile()) { partial = true; continue; }
          try { await readManifest(posix.join(path, child.name), file, child.name); } catch { check(active); partial = true; }
        }
        for (const child of children) {
          check(active); if (child.isSymbolicLink()) continue;
          if (!child.isDirectory()) continue;
          if (depth === MAX_DEPTH) { partial = true; continue; }
          try { await walk(posix.join(path, child.name), depth + 1, file, child.name); } catch { check(active); partial = true; }
        }
      } finally { await file.close(); }
    }
    await walk("", 0); check(active);
    const declarations: Declaration[] = [];
    for (const manifest of manifests) {
      check(active);
      // Workspace membership augments the owning package; it is not a service.
      if (basename(manifest.path) === "pnpm-workspace.yaml") continue;
      if (components.length === 64) { partial = true; break; }
      const filename = basename(manifest.path), directory = posix.dirname(manifest.path);
      const component: ProjectComponent = { id: manifest.path, evidence: manifest.path, directory,
        name: directory === "." ? basename(canonicalRoot) : posix.basename(directory), family: "node", frameworks: [], workflows: [] };
      const declaration: Declaration = { component, dependencies: [], workspaces: [], workspaceEvidence: manifest.path };
      try {
        if (filename === "package.json") {
          const data = record(JSON.parse(manifest.text)); if (!data) throw new Error("Malformed manifest");
          if (data.name !== undefined) { if (!safe(data.name)) throw new Error("Invalid package name"); component.name = data.name; }
          for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
            if (data[key] === undefined) continue;
            const dependencies = record(data[key]); if (!dependencies) { partial = true; continue; }
            const values = Object.entries(dependencies); if (values.length > 512) partial = true;
            for (const [name, value] of values.slice(0, 512)) if (safe(name) && typeof value === "string") {
              if (nodeFrameworks[name] && !component.frameworks.includes(nodeFrameworks[name])) component.frameworks.push(nodeFrameworks[name]);
              declaration.dependencies.push([name, value]);
            }
          }
          if (data.scripts !== undefined) {
            const scripts = record(data.scripts); if (!scripts) partial = true;
            else for (const [name, value] of Object.entries(scripts)) {
              if (!safe(name) || typeof value !== "string") { partial = true; continue; }
              if (component.workflows.length === 24) { partial = true; break; }
              component.workflows.push(workflow(name));
            }
          }
          const workspace = Array.isArray(data.workspaces) ? data.workspaces : record(data.workspaces)?.packages;
          if (workspace !== undefined) {
            if (!Array.isArray(workspace)) partial = true;
            else { declaration.workspaces = workspace.filter(safe).slice(0, 24); partial ||= workspace.length > 24 || declaration.workspaces.length !== workspace.length; }
          }
        } else if (["hugo.toml", "config.toml", "Move.toml", "pyproject.toml"].includes(filename)) {
          const parsed = toml(manifest.text); partial ||= parsed.partial;
          const get = (section: string, name: string) => parsed.entries.get(`${section}\0${name}`);
          if (filename === "Move.toml") {
            component.family = "move"; component.frameworks = ["Move"];
            const name = literal(get("package", "name") ?? ""); if (!safe(name)) throw new Error("Missing Move package"); component.name = name;
            for (const [key, value] of parsed.entries) if (/^(dev-)?dependencies\0/.test(key)) {
              const local = tableField(value, "local"); if (local) declaration.dependencies.push([key.split("\0")[1], `local:${local}`]);
            }
          } else if (filename === "pyproject.toml") {
            component.family = "python";
            const name = literal(get("project", "name") ?? get("tool.poetry", "name") ?? ""); if (safe(name)) component.name = name;
            for (const [key, value] of parsed.entries) {
              if (key === "project\0dependencies" || key.startsWith("project.optional-dependencies\0")) {
                const list = strings(value); if (!list) { partial = true; continue; }
                for (const entry of list) { const name = /^([A-Za-z0-9_.-]+)/.exec(entry)?.[1]?.toLowerCase(); if (name && pythonFrameworks[name]) component.frameworks.push(pythonFrameworks[name]); }
              } else if (key.startsWith("tool.poetry.dependencies\0")) {
                const name = key.split("\0")[1].toLowerCase(); if (pythonFrameworks[name]) component.frameworks.push(pythonFrameworks[name]);
              }
            }
          } else {
            component.family = "hugo"; component.frameworks = ["Hugo"];
            const title = literal(get("", "title") ?? ""); if (safe(title)) component.name = title;
            const raw = get("", "baseURL") ?? get("", "baseurl");
            if (raw !== undefined) {
              const url = literal(raw), site = ProjectSiteSchema.safeParse({ name: component.name, url, evidence: manifest.path });
              if (site.success && !new URL(site.data.url).hostname.includes("*") && !new URL(site.data.url).search && !new URL(site.data.url).hash) {
                if (sites.length < 16) sites.push(site.data); else partial = true;
              } else partial = true;
            }
            if (filename === "config.toml" && get("", "baseURL") === undefined && get("", "baseurl") === undefined) continue;
          }
        } else if (filename === "requirements.txt") {
          component.family = "python";
          for (const line of manifest.text.split(/\r?\n/)) {
            const name = /^\s*([A-Za-z0-9][A-Za-z0-9_.-]*)\s*(?:\[|[<>=!~;@]|$)/.exec(line)?.[1]?.toLowerCase();
            if (name && pythonFrameworks[name]) component.frameworks.push(pythonFrameworks[name]);
          }
        } else if (filename === "dune-project") {
          component.family = "ocaml"; component.frameworks = ["Dune"];
          const name = /^\s*\(name\s+([A-Za-z0-9_.-]+)\s*\)/m.exec(manifest.text)?.[1]; if (safe(name)) component.name = name;
          if (!/^\s*\(lang\s+dune\s+\d+(?:\.\d+)*\s*\)/m.test(manifest.text)) throw new Error("Missing Dune declaration");
        } else {
          component.family = "bazel"; component.frameworks = ["Bazel"];
          if (components.some((entry) => entry.family === "bazel" && entry.directory === directory)) continue;
        }
        component.frameworks = [...new Set(component.frameworks)];
        if (component.frameworks.length > 12) { component.frameworks = component.frameworks.slice(0, 12); partial = true; }
        if (!ProjectComponentSchema.safeParse(component).success) { partial = true; continue; }
        components.push(component); declarations.push(declaration);
      } catch { partial = true; }
    }
    for (const directory of pnpmDirectories) {
      const owner = declarations.find((entry) => entry.component.family === "node" && entry.component.directory === directory);
      if (!owner) { partial = true; continue; }
      const path = posix.join(directory, "pnpm-workspace.yaml"), manifest = manifests.find((entry) => entry.path === path);
      // The pnpm declaration takes precedence, including when it cannot be read.
      // Do not fall back to a broader package.json list around exclusions.
      owner.workspaces = []; owner.workspaceEvidence = path;
      const packages = manifest && pnpmPackages(manifest.text);
      if (packages === undefined) partial = true; else owner.workspaces = packages;
    }
    const add = (from: ProjectComponent, to: string, kind: ProjectRelationship["kind"], evidence = from.evidence) => {
      if (relationships.some((edge) => edge.from === from.id && edge.to === to && edge.kind === kind)) return;
      if (relationships.length === 128) { partial = true; return; }
      relationships.push({ from: from.id, to, kind, evidence });
    };
    const belongs = (owner: Declaration, child: ProjectComponent) => owner.component.id === child.id ||
      owner.workspaces.some((pattern) => workspaceMatch(pattern, posix.relative(owner.component.directory, child.directory)));
    const commonWorkspace = (left: ProjectComponent, right: ProjectComponent) => declarations.some((owner) =>
      owner.workspaces.length > 0 && belongs(owner, left) && belongs(owner, right));
    for (const declaration of declarations) {
      check(active); const from = declaration.component;
      for (const [name, version] of declaration.dependencies) {
        let target: ProjectComponent | undefined;
        if (version.startsWith("file:") || version.startsWith("link:") || version.startsWith("local:")) {
          const path = pathToManifest(from.id, version.slice(version.indexOf(":") + 1), from.family === "move" ? "Move.toml" : "package.json");
          target = components.find((candidate) => candidate.id === path);
        } else if (version.startsWith("workspace:")) {
          const matches = components.filter((candidate) => candidate.family === "node" && candidate.name === name && commonWorkspace(from, candidate));
          if (matches.length === 1) target = matches[0]; else partial = true;
        }
        if (target && target.id !== from.id) add(from, target.id, "depends-on");
      }
      for (const child of components) {
        if (child.family !== "node" || child.id === from.id) continue;
        const local = posix.relative(from.directory, child.directory);
        if (declaration.workspaces.some((pattern) => workspaceMatch(pattern, local))) add(from, child.id, "contains", declaration.workspaceEvidence);
      }
    }
    check(active); if (await realpath(root) !== canonicalRoot) throw new Error("Root moved"); check(active);
    return ProjectCatalogSchema.parse(partial ? incomplete("Some manifest data or directories were unreadable, unsupported, or beyond scan limits") :
      result("observed", components.length ? undefined : "No supported project manifests found"));
  };
  const pending = work().catch(() => signal.aborted ? { scan: { status: "unavailable" as const, message: "Catalog scan cancelled" }, components: [], relationships: [], sites: [] } :
    incomplete("Project manifest metadata is unavailable"));
  pendingWalk = pending;
  void pending.then(() => { if (pendingWalk === pending) pendingWalk = undefined; });
  try {
    return await Promise.race([pending, stopped]);
  } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); controller.abort(); }
}
