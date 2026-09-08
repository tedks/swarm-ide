import { execFile } from "node:child_process";
import { posix } from "node:path";
import { parseDocument } from "yaml";
import { z } from "zod";
import { readCanonicalWorkspaceBytes, resolveWorkspaceFile, WorkspaceFileError } from "./files";
import { RepositoryPathSchema } from "../protocol/repository";
import { DeclaredServiceSchema, type DeclaredService } from "../protocol/service-declarations";

const text = z.string().min(1).max(512);
const contract = z.object({ id: text, name: text, requestType: text, responseType: text });
const nativeSchema = z.object({
  schemaVersion: z.literal(1), service: z.object({ id: text, displayName: text }).strict(),
  providedInterfaces: z.array(contract.strict()).max(32).default([]),
  requiredInterfaces: z.array(contract.extend({ serviceId: text }).strict()).max(32).default([]),
  implementationPaths: z.array(RepositoryPathSchema).max(64).default([]),
  interfaceDeclarationPaths: z.array(z.object({ interfaceId: text, path: RepositoryPathSchema }).strict()).max(64).default([]),
  owningTarget: z.string().regex(/^\/\/[^\s:]*:[^\s:]+$/).max(512).optional(),
}).strict();
const composeNames = new Set(["compose.yaml", "compose.yml", "docker-compose.yml", "docker-compose.yaml"]);
const excluded = new Set(["node_modules", "vendor", "dist", "build", "target", "fixtures", "__fixtures__", "testdata", "tests"]);
export interface ServiceDiscovery {
  services: DeclaredService[];
  dependencies: Array<{ source: string; target: string; kind: "starts-after"; label: string }>;
  paths: string[]; issues: string[];
  /** Invalid/unreadable inputs differ from supported partial-coverage warnings. */
  invalid?: boolean;
}

function candidate(path: string): boolean {
  const parts = path.split("/");
  return !parts.slice(0, -1).some((part) => excluded.has(part) || part.startsWith("bazel-") || (part.startsWith(".") && part !== ".swarm")) &&
    (composeNames.has(parts.at(-1)!) || parts.at(-1) === "service.swarm.json");
}

/** Git's tracked and nonignored working files; no repository scripts or Docker. */
export function serviceDeclarationPaths(root: string, signal?: AbortSignal): Promise<string[]> {
  return new Promise((resolve, reject) => {
    execFile("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: root, encoding: "buffer", maxBuffer: 64 * 1024 * 1024, timeout: 10_000, signal }, (error, stdout) => {
        if (error) { reject(new Error("Could not list service declarations.")); return; }
        try {
          const files = new TextDecoder("utf-8", { fatal: true }).decode(stdout).split("\0").filter(candidate);
          resolve([...new Set(files)].sort());
        } catch { reject(new Error("Service declaration filenames are not valid UTF-8.")); }
      });
  });
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
const validName = (value: string) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value) && value.length <= 160;

export async function discoverServices(root: string, signal?: AbortSignal): Promise<ServiceDiscovery> {
  const found = await serviceDeclarationPaths(root, signal);
  const result: ServiceDiscovery = { services: [], dependencies: [], paths: [], issues: [] };
  const issues = (message: string) => { if (result.issues.length < 128) result.issues.push(message.slice(0, 512)); };
  if (found.length > 128) issues(`Showing the first 128 of ${found.length} declaration files.`);
  const ids = new Set<string>();
  for (const path of found.slice(0, 128)) {
    if (signal?.aborted) throw new Error("Service discovery stopped.");
    try {
      RepositoryPathSchema.parse(path);
      const bytes = await readCanonicalWorkspaceBytes(root, path, 1024 * 1024);
      const contents = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      let services: DeclaredService[] = [], dependencies: ServiceDiscovery["dependencies"] = [];
      if (posix.basename(path) === "service.swarm.json") {
        const source = nativeSchema.parse(JSON.parse(contents));
        const contracts = [...source.providedInterfaces, ...source.requiredInterfaces];
        if (new Set(contracts.map((entry) => entry.id)).size !== contracts.length) throw new Error("Duplicate interface identifiers.");
        const declarations = new Map(source.interfaceDeclarationPaths.map((entry) => [entry.interfaceId, entry.path]));
        if (declarations.size !== source.interfaceDeclarationPaths.length || [...declarations.keys()].some((id) => !contracts.some((entry) => entry.id === id))) throw new Error("Interface source association is ambiguous.");
        const implementationPaths: string[] = [];
        for (const sourcePath of source.implementationPaths) {
          try { await resolveWorkspaceFile(root, sourcePath); implementationPaths.push(sourcePath); }
          catch { issues(`${path}: implementation file unavailable: ${sourcePath}`); }
        }
        const interfaces: DeclaredService["interfaces"] = [];
        for (const [role, list] of [["provided", source.providedInterfaces], ["required", source.requiredInterfaces]] as const) {
          for (const entry of list) {
            let declaration = declarations.get(entry.id) ?? path;
            try { await resolveWorkspaceFile(root, declaration); }
            catch { issues(`${path}: interface file unavailable: ${declaration}`); declaration = path; }
            interfaces.push({ ...entry, id: `${source.service.id}:${role}:${entry.id}`, role, path: declaration });
          }
        }
        services = [{ ...source.service, declarationPath: path, implementationPaths, interfaces,
          ...(source.owningTarget ? { owningTarget: source.owningTarget } : {}) }];
      } else {
        const document = parseDocument(contents, { uniqueKeys: true, merge: true });
        if (document.errors.length) throw new Error("Invalid Compose YAML.");
        const source = object(document.toJS({ maxAliasCount: 100 }));
        const definitions = object(source?.services);
        if (!source || !definitions) throw new Error("Compose has no services mapping.");
        if (source.include || source.extends) issues(`${path}: included or extended Compose files are not merged.`);
        const composeId = (name: string) => `service:${encodeURIComponent(path)}:${name}`;
        for (const [name, value] of Object.entries(definitions)) {
          if (!validName(name) || !object(value)) { issues(`${path}: unsupported service declaration ${name}`); continue; }
          const definition = object(value)!;
          services.push({ id: composeId(name), displayName: name, declarationPath: path, implementationPaths: [], interfaces: [] });
          if (definition.extends) issues(`${path}: ${name} extends another declaration; inherited fields are not shown.`);
          const requires = definition.depends_on;
          const names = requires === undefined ? [] : Array.isArray(requires) ? requires : Object.keys(object(requires) ?? {});
          if (requires !== undefined && !Array.isArray(requires) && !object(requires)) issues(`${path}: unsupported depends_on for ${name}`);
          for (const dependency of names) {
            if (typeof dependency !== "string" || !validName(dependency) || !object(definitions[dependency])) { issues(`${path}: ${name} has an unresolved startup dependency.`); continue; }
            dependencies.push({ source: composeId(name), target: composeId(dependency), kind: "starts-after", label: "starts after" });
          }
        }
      }
      services = services.map((service) => DeclaredServiceSchema.parse(service));
      const nodeIds = services.flatMap((service) => [service.id, ...service.interfaces.map((entry) => entry.id)]);
      if (new Set(nodeIds).size !== nodeIds.length || nodeIds.some((id) => ids.has(id))) { issues(`${path}: duplicate service/interface id; declaration omitted.`); result.invalid = true; continue; }
      dependencies = dependencies.filter((entry, index, all) => all.findIndex((other) => other.source === entry.source && other.target === entry.target) === index);
      const nodes = result.services.reduce((count, service) => count + 1 + service.interfaces.length, 0) + services.reduce((count, service) => count + 1 + service.interfaces.length, 0);
      if (nodes > 480 || result.services.length + services.length > 400 || result.dependencies.length + dependencies.length > 1500) { issues(`${path}: service graph display is full; this declaration is omitted.`); continue; }
      for (const id of nodeIds) ids.add(id);
      result.services.push(...services);
      result.dependencies.push(...dependencies); result.paths.push(path);
    } catch (error) {
      if (signal?.aborted) throw new Error("Service discovery stopped.");
      // Unstaged deletion remains in ls-files --cached. The provider checks the
      // working fingerprint around this read, so absence is a valid deletion.
      if (error instanceof WorkspaceFileError && error.code === "FILE_NOT_FOUND") continue;
      // Raw manifests may contain credentials. Diagnostics name the file only.
      result.invalid = true;
      issues(`${path}: could not read a valid service declaration (${error instanceof SyntaxError ? "invalid JSON" : "check format and local file paths"}).`);
    }
  }
  return result;
}
