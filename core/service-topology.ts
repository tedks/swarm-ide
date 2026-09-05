import { createHash } from "node:crypto";
import { posix } from "node:path";
import { z } from "zod";
import {
  PROTOCOL_VERSION,
  type FocusRef,
  type GraphSlice,
  type NavigationMapping,
  type Provenance,
  type Widget,
} from "../protocol/schema";

const IdSchema = z.string().regex(/^(service|interface):[a-z0-9][a-z0-9.-]*$/);
const InterfaceSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(160),
  requestType: z.string().regex(/^[A-Za-z][A-Za-z0-9_.]*$/),
  responseType: z.string().regex(/^[A-Za-z][A-Za-z0-9_.]*$/),
}).strict();

export const ServiceTopologyArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  service: z.object({ id: z.string().regex(/^service:[a-z0-9][a-z0-9.-]*$/), displayName: z.string().min(1).max(160) }).strict(),
  providedInterfaces: z.array(InterfaceSchema).min(1).max(32),
  requiredInterfaces: z.array(InterfaceSchema.extend({ serviceId: z.string().regex(/^service:[a-z0-9][a-z0-9.-]*$/) }).strict()).max(32),
  owningTarget: z.string().regex(/^\/\/[A-Za-z0-9_./-]+:[A-Za-z0-9_.-]+$/),
  implementationPaths: z.array(z.string().min(1).max(4_096)).min(1).max(64),
  interfaceDeclarationPaths: z.array(z.object({ interfaceId: IdSchema, path: z.string().min(1).max(4_096) }).strict()).min(1).max(64),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((artifact, context) => {
  const ids = [artifact.service.id, ...artifact.providedInterfaces.map((item) => item.id), ...artifact.requiredInterfaces.map((item) => item.id)];
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["providedInterfaces"], message: "service and interface ids must be unique" });
  const paths = new Set<string>();
  const allPaths = [...artifact.implementationPaths, ...artifact.interfaceDeclarationPaths.map((item) => item.path)];
  for (const [index, path] of allPaths.entries()) {
    if (path.startsWith("/") || path.includes("\\") || posix.normalize(path) !== path || path.split("/").includes("..")) {
      context.addIssue({ code: "custom", path: ["implementationPaths", index], message: "implementation path must be canonical and contained" });
    }
    if (paths.has(path) && index < artifact.implementationPaths.length) context.addIssue({ code: "custom", path: ["implementationPaths", index], message: "implementation paths must be unique" });
    paths.add(path);
  }
  const interfaceIds = [...artifact.providedInterfaces, ...artifact.requiredInterfaces].map((item) => item.id).sort();
  const sourceIds = artifact.interfaceDeclarationPaths.map((item) => item.interfaceId).sort();
  if (new Set(sourceIds).size !== sourceIds.length || interfaceIds.length !== sourceIds.length || interfaceIds.some((id, index) => id !== sourceIds[index])) {
    context.addIssue({ code: "custom", path: ["interfaceDeclarationPaths"], message: "every interface must have exactly one declaration path" });
  }
});
export type ServiceTopologyArtifact = z.infer<typeof ServiceTopologyArtifactSchema>;

const MANIFEST_PATH = "examples/checkout-world/services/fraudcheck/service.swarm.json";

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

export function adaptServiceTopology(
  artifact: ServiceTopologyArtifact,
  artifactUri: string,
  buildId: string,
  fingerprint: string,
  epoch: number,
  observedAt: string,
): { graph: GraphSlice; mappings: NavigationMapping[]; widgets: Widget[] } {
  const implementationPath = artifact.implementationPaths.find((path) => path.endsWith("fraudcheck.ts")) ?? artifact.implementationPaths[0]!;
  const declarationPaths = new Map(artifact.interfaceDeclarationPaths.map((item) => [item.interfaceId, item.path]));
  const serviceFocus = focus("service", artifact.service.id, fingerprint, implementationPath);
  const nodes: GraphSlice["nodes"] = [{
    id: artifact.service.id,
    label: artifact.service.displayName,
    kind: "service",
    status: "green",
    position: { x: 30, y: 90 },
    focus: serviceFocus,
    detail: artifact.owningTarget,
  }];
  const edges: GraphSlice["edges"] = [];
  const mappings: NavigationMapping[] = [];
  let y = 20;
  for (const provided of artifact.providedInterfaces) {
    const interfaceFocus = focus("interface", provided.id, fingerprint, declarationPaths.get(provided.id), provided.name);
    nodes.push({ id: provided.id, label: provided.name, kind: "provided interface", status: "green", position: { x: 310, y }, focus: interfaceFocus, detail: `${provided.requestType} → ${provided.responseType}` });
    edges.push({ id: `${artifact.service.id}:provides:${provided.id}`, source: artifact.service.id, target: provided.id, kind: "provides", label: "provides", status: "green" });
    y += 130;
  }
  for (const required of artifact.requiredInterfaces) {
    const interfaceFocus = focus("interface", required.id, fingerprint, declarationPaths.get(required.id), required.name);
    nodes.push({ id: required.id, label: required.name, kind: "required interface", status: "green", position: { x: 310, y }, focus: interfaceFocus, detail: `${required.requestType} → ${required.responseType}` });
    edges.push({ id: `${artifact.service.id}:requires:${required.id}`, source: artifact.service.id, target: required.id, kind: "requires", label: "requires", status: "green" });
    y += 130;
  }
  for (const item of [serviceFocus, ...nodes.slice(1).map((node) => node.focus)]) {
    const candidatePath = item.path ?? artifact.implementationPaths[0]!;
    mappings.push({
      from: item,
      targetTopology: "repo",
      ambiguous: false,
      candidates: [{
        focus: focus("repo", `file:${candidatePath}`, fingerprint, candidatePath),
        nodeId: `repo:file:${candidatePath}`,
        confidence: 1,
        reason: "declared implementation source",
      }],
    });
  }
  const provenance: Provenance = { sourceKind: "build", uri: artifactUri, version: buildId, observedAt };
  const widgets: Widget[] = [
    { id: "owning-target", title: "Owning target", kind: "code", priority: 1, value: artifact.owningTarget, provenance },
    { id: "provided-interfaces", title: "Provided", kind: "list", priority: 2, value: artifact.providedInterfaces.map((item) => `${item.name}: ${item.requestType} → ${item.responseType}`), provenance },
    { id: "required-interfaces", title: "Required", kind: "list", priority: 3, value: artifact.requiredInterfaces.map((item) => `${item.name}: ${item.requestType} → ${item.responseType}`), provenance },
    { id: "source-paths", title: "Implementation sources", kind: "list", priority: 4, value: artifact.implementationPaths, provenance },
    { id: "artifact", title: "Topology artifact", kind: "status", priority: 5, value: `${artifactUri} · sha256:${buildId.slice(0, 12)}`, provenance },
    { id: "deployment", title: "Deployment", kind: "status", priority: 6, value: "not configured", provenance: { sourceKind: "repo", uri: `repo://${MANIFEST_PATH}`, version: fingerprint, observedAt } },
  ];
  return {
    graph: {
      schemaVersion: PROTOCOL_VERSION,
      topologyId: "service",
      title: "Service topology",
      scope: "//examples/checkout-world/services/fraudcheck/...",
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
