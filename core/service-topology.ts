import { createHash } from "node:crypto";
import { posix } from "node:path";
import { z } from "zod";
import type { ServiceDiscovery } from "./service-discovery";
import type { ServiceDeclarations } from "../protocol/service-declarations";
import { ServiceContextObservationSchema, type ServiceContextObservation } from "../protocol/context";
import {
  PROTOCOL_VERSION,
  type FocusRef,
  type GraphSlice,
  type NavigationMapping,
  type Provenance,
  type Widget,
} from "../protocol/schema";

const IdSchema = z.string().regex(/^interface:[a-z0-9][a-z0-9.-]*$/);
const ProtoTypeSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/);
const InterfaceBaseSchema = z.object({
  id: IdSchema,
  requestType: ProtoTypeSchema,
  responseType: ProtoTypeSchema,
});
const ProvidedInterfaceSchema = InterfaceBaseSchema.extend({ name: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/) }).strict();
const RequiredInterfaceSchema = InterfaceBaseSchema.extend({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/),
  serviceId: z.string().regex(/^service:[a-z0-9][a-z0-9.-]*$/),
}).strict();

export const ServiceTopologyArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  service: z.object({ id: z.string().regex(/^service:[a-z0-9][a-z0-9.-]*$/), displayName: z.string().min(1).max(160) }).strict(),
  providedInterfaces: z.array(ProvidedInterfaceSchema).min(1).max(32),
  requiredInterfaces: z.array(RequiredInterfaceSchema).max(32),
  owningTarget: z.string().regex(/^\/\/[A-Za-z0-9_./-]+:[A-Za-z0-9_.-]+$/),
  implementationPaths: z.array(z.string().min(1).max(4_096)).min(1).max(64),
  interfaceDeclarationPaths: z.array(z.object({ interfaceId: IdSchema, path: z.string().min(1).max(4_096) }).strict()).min(1).max(64),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((artifact, context) => {
  const ids = [artifact.service.id, ...artifact.providedInterfaces.map((item) => item.id), ...artifact.requiredInterfaces.map((item) => item.id)];
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["providedInterfaces"], message: "service and interface ids must be unique" });
  const implementationPaths = new Set<string>();
  for (const [index, path] of artifact.implementationPaths.entries()) {
    if (path.startsWith("/") || path.includes("\\") || posix.normalize(path) !== path || path.split("/").includes("..")) {
      context.addIssue({ code: "custom", path: ["implementationPaths", index], message: "implementation path must be canonical and contained" });
    }
    if (implementationPaths.has(path)) context.addIssue({ code: "custom", path: ["implementationPaths", index], message: "implementation paths must be unique" });
    implementationPaths.add(path);
  }
  for (const [index, { path }] of artifact.interfaceDeclarationPaths.entries()) {
    if (path.startsWith("/") || path.includes("\\") || posix.normalize(path) !== path || path.split("/").includes("..")) {
      context.addIssue({ code: "custom", path: ["interfaceDeclarationPaths", index, "path"], message: "interface declaration path must be canonical and contained" });
    }
  }
  for (const [index, required] of artifact.requiredInterfaces.entries()) {
    const serviceName = required.name.slice(0, required.name.indexOf("."));
    const expectedServiceId = `service:${serviceName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
    if (required.serviceId !== expectedServiceId) {
      context.addIssue({ code: "custom", path: ["requiredInterfaces", index, "serviceId"], message: "required interface name and serviceId disagree" });
    }
  }
  const interfaceIds = [...artifact.providedInterfaces, ...artifact.requiredInterfaces].map((item) => item.id).sort();
  const sourceIds = artifact.interfaceDeclarationPaths.map((item) => item.interfaceId).sort();
  if (new Set(sourceIds).size !== sourceIds.length || interfaceIds.length !== sourceIds.length || interfaceIds.some((id, index) => id !== sourceIds[index])) {
    context.addIssue({ code: "custom", path: ["interfaceDeclarationPaths"], message: "every interface must have exactly one declaration path" });
  }
});
export type ServiceTopologyArtifact = z.infer<typeof ServiceTopologyArtifactSchema>;

function focus(domain: FocusRef["domain"], key: string, fingerprint: string, path?: string, symbol?: string): FocusRef {
  return {
    worldId: "world:working",
    revisionKind: "working",
    revisionId: fingerprint,
    domain,
    key,
    ...(path ? { path } : {}),
    ...(symbol ? { symbol } : {}),
  };
}

export function artifactBuildId(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Source declarations use repo provenance and never advance a build revision. */
export function adaptDeclaredServices(input: ServiceDiscovery, fingerprint: string, epoch: number, observedAt: string, repositoryId: string): {
  graph: GraphSlice; mappings: NavigationMapping[]; widgets: Widget[]; declarations: ServiceDeclarations;
} {
  const nodes: GraphSlice["nodes"] = [], edges: GraphSlice["edges"] = [], mappings: NavigationMapping[] = [];
  const status = input.issues.length ? "yellow" as const : "green" as const;
  let row = 0;
  for (const service of input.services) {
    const serviceFocus = focus("service", service.id, fingerprint, service.declarationPath);
    nodes.push({ id: service.id, label: service.displayName, kind: "declared service", status,
      position: { x: 280, y: row * 100 }, focus: serviceFocus, detail: service.owningTarget ?? service.declarationPath });
    const candidates = [service.declarationPath, ...service.implementationPaths].filter((value, index, all) => all.indexOf(value) === index).slice(0, 32);
    mappings.push({ from: serviceFocus, targetTopology: "repo", ambiguous: candidates.length > 1,
      candidates: candidates.map((path) => ({ focus: focus("repo", `file:${path}`, fingerprint, path), revealPath: path,
        confidence: 1, reason: path === service.declarationPath ? "service declaration" : "declared implementation file" })) });
    for (const [index, entry] of service.interfaces.entries()) {
      const interfaceFocus = focus("interface", entry.id, fingerprint, entry.path, entry.name);
      nodes.push({ id: entry.id, label: entry.name, kind: `${entry.role} interface`, status,
        position: { x: entry.role === "provided" ? 0 : 560, y: (row + index) * 100 }, focus: interfaceFocus,
        detail: `${entry.requestType} → ${entry.responseType}` });
      edges.push({ id: `${service.id}:${entry.role}:${entry.id}`, source: service.id, target: entry.id,
        kind: entry.role === "provided" ? "provides" : "requires", label: entry.role === "provided" ? "provides" : "requires", status });
      mappings.push({ from: interfaceFocus, targetTopology: "repo", ambiguous: false,
        candidates: [{ focus: focus("repo", `file:${entry.path}`, fingerprint, entry.path), revealPath: entry.path, confidence: 1, reason: "authored interface declaration" }] });
    }
    row += Math.max(1, service.interfaces.length) + 1;
  }
  for (const dependency of input.dependencies) edges.push({ ...dependency, id: `${dependency.source}:starts-after:${dependency.target}`, status });
  const provenance: Provenance = { sourceKind: "repo", uri: "repo://service-declarations", version: fingerprint, observedAt };
  return {
    graph: { schemaVersion: PROTOCOL_VERSION, topologyId: "service", title: "Services", scope: "project declarations", zoomBand: "service",
      epoch, reconciliation: status, inputFingerprint: fingerprint, nodes, edges, provenance: [provenance] },
    mappings,
    widgets: [{ id: "service-declarations", title: "Services", kind: "status", priority: 1,
      value: input.services.length ? `${input.services.length} declared services` : "No service declarations found", provenance }],
    declarations: { repositoryId, worldId: "world:working", sourceFingerprint: fingerprint, observedAt,
      status: input.issues.length ? "partial" : "current", paths: input.paths, issues: input.issues, services: input.services },
  };
}

export function adaptServiceTopology(
  artifact: ServiceTopologyArtifact,
  artifactUri: string,
  buildId: string,
  fingerprint: string,
  epoch: number,
  observedAt: string,
  repositoryId = "repository:unregistered",
  manifestPath = "service.swarm.json",
): { graph: GraphSlice; mappings: NavigationMapping[]; widgets: Widget[]; serviceContext: ServiceContextObservation } {
  const implementationPath = artifact.implementationPaths[0]!;
  const declarationPaths = new Map(artifact.interfaceDeclarationPaths.map((item) => [item.interfaceId, item.path]));
  const serviceFocus = focus("service", artifact.service.id, fingerprint, implementationPath);
  const nodes: GraphSlice["nodes"] = [{
    id: artifact.service.id,
    label: artifact.service.displayName,
    kind: "service",
    status: "green",
    position: { x: 310, y: 30 + (Math.max(artifact.providedInterfaces.length, artifact.requiredInterfaces.length) - 1) * 55 },
    focus: serviceFocus,
    detail: artifact.owningTarget,
  }];
  const edges: GraphSlice["edges"] = [];
  const mappings: NavigationMapping[] = [];
  let y = 30;
  for (const provided of artifact.providedInterfaces) {
    const interfaceFocus = focus("interface", provided.id, fingerprint, declarationPaths.get(provided.id), provided.name);
    nodes.push({ id: provided.id, label: provided.name, kind: "provided interface", status: "green", position: { x: 20, y }, focus: interfaceFocus, detail: `${provided.requestType} → ${provided.responseType}` });
    edges.push({ id: `${provided.id}:handled-by:${artifact.service.id}`, source: provided.id, target: artifact.service.id, kind: "provides", label: "handled by", status: "green" });
    y += 110;
  }
  y = 30;
  for (const required of artifact.requiredInterfaces) {
    const interfaceFocus = focus("interface", required.id, fingerprint, declarationPaths.get(required.id), required.name);
    nodes.push({ id: required.id, label: required.name, kind: "required interface", status: "green", position: { x: 600, y }, focus: interfaceFocus, detail: `${required.serviceId} · ${required.requestType} → ${required.responseType}` });
    edges.push({ id: `${artifact.service.id}:calls:${required.id}`, source: artifact.service.id, target: required.id, kind: "requires", label: "calls", status: "green" });
    y += 110;
  }
  for (const item of [serviceFocus, ...nodes.slice(1).map((node) => node.focus)]) {
    const candidatePath = item.path ?? artifact.implementationPaths[0]!;
    mappings.push({
      from: item,
      targetTopology: "repo",
      ambiguous: false,
      candidates: [{
        focus: focus("repo", `file:${candidatePath}`, fingerprint, candidatePath),
        revealPath: candidatePath,
        confidence: 1,
        reason: item.domain === "interface" ? "declared protobuf interface source" : "Bazel-owned implementation source",
      }],
    });
  }
  const provenance: Provenance = { sourceKind: "build", uri: artifactUri, version: buildId, observedAt };
  const widgets: Widget[] = [
    { id: "owning-target", title: "Owning target", kind: "code", priority: 1, value: artifact.owningTarget, provenance },
    { id: "provided-interfaces", title: "Provided", kind: "list", priority: 2, value: artifact.providedInterfaces.map((item) => `${item.name}: ${item.requestType} → ${item.responseType}`), provenance },
    { id: "required-interfaces", title: "Required", kind: "list", priority: 3, value: artifact.requiredInterfaces.map((item) => `${item.name}: ${item.requestType} → ${item.responseType}`), provenance },
    { id: "source-paths", title: "Implementation sources", kind: "list", priority: 4, value: artifact.implementationPaths, provenance },
    { id: "artifact", title: "Topology artifact", kind: "status", priority: 5, value: `${artifactUri} · artifact sha256:${buildId.slice(0, 12)} · inputs sha256:${artifact.inputDigest.slice(0, 12)}`, provenance },
    { id: "deployment", title: "Deployment", kind: "status", priority: 6, value: "not configured", provenance: { sourceKind: "repo", uri: `repo://${manifestPath}`, version: fingerprint, observedAt } },
  ];
  const context = ServiceContextObservationSchema.safeParse({ repositoryId, worldId: "world:working", status: "observed", artifactUri, buildId,
    sourceFingerprint: fingerprint, inputDigest: artifact.inputDigest, observedAt,
    service: { ...artifact.service, owningTarget: artifact.owningTarget, manifestPath,
      implementationPaths: artifact.implementationPaths, interfaceDeclarationPaths: artifact.interfaceDeclarationPaths,
      providedInterfaces: artifact.providedInterfaces, requiredInterfaces: artifact.requiredInterfaces } });
  return {
    serviceContext: context.success ? context.data : { repositoryId, worldId: "world:working", status: "unavailable", reason: "Service artifact context is unsupported or exceeds its publication budget" },
    graph: {
      schemaVersion: PROTOCOL_VERSION,
      topologyId: "service",
      title: "Service topology",
      scope: artifact.owningTarget,
      zoomBand: "service",
      epoch,
      reconciliation: "green",
      inputFingerprint: fingerprint,
      nodes,
      edges,
      provenance: [provenance],
    },
    mappings,
    widgets,
  };
}
