import { z } from "zod";
import { RepositoryPathSchema } from "./repository";
import type { TaskBacklinkTarget } from "./tasks";

export const CONTEXT_BYTES = 256 * 1024;
export const CONTEXT_ROWS = 32;
const text = z.string().min(1).max(512);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const interfaceId = z.string().regex(/^interface:[a-z0-9][a-z0-9.-]*$/).max(512);
const serviceId = z.string().regex(/^service:[a-z0-9][a-z0-9.-]*$/).max(512);
const contract = z.object({ id: interfaceId, name: text, requestType: text, responseType: text }).strict();
const record = z.object({
  id: serviceId, displayName: text, owningTarget: text, manifestPath: RepositoryPathSchema,
  implementationPaths: z.array(RepositoryPathSchema).min(1).max(64),
  interfaceDeclarationPaths: z.array(z.object({ interfaceId, path: RepositoryPathSchema }).strict()).max(64),
  providedInterfaces: z.array(contract).min(1).max(32),
  requiredInterfaces: z.array(contract.extend({ serviceId })).max(32),
}).strict().superRefine((value, ctx) => {
  const ids = [...value.providedInterfaces, ...value.requiredInterfaces].map((item) => item.id);
  const declarations = value.interfaceDeclarationPaths.map((item) => item.interfaceId);
  if (new Set(ids).size !== ids.length || new Set(declarations).size !== declarations.length || ids.length !== declarations.length || ids.some((id) => !declarations.includes(id)) || new Set(value.implementationPaths).size !== value.implementationPaths.length)
    ctx.addIssue({ code: "custom", message: "Exact unique implementation and interface declaration membership required" });
});
const identity = { repositoryId: text, worldId: text };
export const ServiceContextObservationSchema = z.discriminatedUnion("status", [
  z.object({ ...identity, status: z.literal("unavailable"), reason: text }).strict(),
  z.object({ ...identity, status: z.literal("observed"), artifactUri: text, buildId: digest,
    sourceFingerprint: text, inputDigest: digest, observedAt: z.string().datetime(), service: record,
  }).strict(),
]).superRefine((value, ctx) => {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > CONTEXT_BYTES)
    ctx.addIssue({ code: "custom", message: "Context publication exceeds its byte budget" });
});
export type ServiceContextObservation = z.infer<typeof ServiceContextObservationSchema>;
export type ObservedServiceContext = Extract<ServiceContextObservation, { status: "observed" }>;

/** Subjects are renderer-local attention, not a universal graph node. */
export type ContextSubject = { repositoryId: string; worldId: string } & (
  | { kind: "file" | "directory"; path: string }
  | { kind: "service" | "interface"; id: string }
  | { kind: "edge"; id: string; topologyId: string }
  | { kind: "task"; id: string | null }
);
export interface ContextEvidenceRef {
  provider: string; repositoryId: string; worldId: string; origin: string;
  revisionKind: "source-read" | "buffer" | "directory" | "built" | "capture" | "build-query" | "ditz";
  revision: string; observedAt: string | null; timeBasis: "producer" | "client receipt" | "local edit" | "unavailable";
  freshness: "current" | "retained" | "CAPTURE"; coverage: string;
}
export type ContextLink = { kind: "source"; path: string } | { kind: "graph"; topologyId: string; id: string } | { kind: "task"; target: TaskBacklinkTarget };
export interface ContextSection {
  id: string; title: string; evidence?: ContextEvidenceRef; notice?: string;
  rows: Array<{ label: string; value: string; link?: ContextLink }>; total?: number;
}
