import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";

const text = z.string().min(1).max(512).refine((value) => [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127));
const port = z.number().int().min(1).max(65535);
export const ProjectEndpointSchema = z.object({
  address: text, port, protocol: z.enum(["tcp", "udp"]),
  url: z.string().max(2048).url().refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !["0.0.0.0", "[::]"].includes(url.hostname);
  }).optional(),
}).strict();
export const ProjectServerSchema = z.object({
  pid: z.number().int().positive(), name: text, directory: text,
  association: z.enum(["worktree", "bazel-output"]),
  endpoints: z.array(ProjectEndpointSchema).max(16),
}).strict();
export const ProjectContainerSchema = z.object({
  id: text, name: text, image: text, state: text, health: text.optional(),
  service: text.optional(), directory: text,
  endpoints: z.array(ProjectEndpointSchema).max(16),
  cpuPercent: z.number().finite().nonnegative().optional(),
  memoryBytes: z.number().finite().nonnegative().optional(),
  memoryLimitBytes: z.number().finite().nonnegative().optional(),
}).strict();
export const ProjectScanSchema = z.object({
  status: z.enum(["observed", "partial", "unavailable"]), message: text.optional(),
  observedAt: z.string().datetime().optional(), retained: z.boolean().optional(),
}).strict();
const sourcePath = text.refine((value) => !value.startsWith("/") && !value.includes("\\") && value.split("/").every((part) => part !== ".." && part !== ""));
export const ProjectComponentSchema = z.object({
  id: sourcePath, name: text, directory: sourcePath,
  family: z.enum(["node", "python", "hugo", "move", "ocaml", "bazel"]),
  frameworks: z.array(text).max(12), evidence: sourcePath,
  workflows: z.array(z.object({ name: text, kind: z.enum(["develop", "build", "test", "deploy", "other"]) }).strict()).max(24),
}).strict();
export const ProjectRelationshipSchema = z.object({
  from: sourcePath, to: text, kind: z.enum(["depends-on", "proxy", "shares-source", "contains"]), evidence: sourcePath,
}).strict();
export const ProjectSiteSchema = z.object({
  name: text, url: ProjectEndpointSchema.shape.url.unwrap(), evidence: sourcePath,
}).strict();
export const ProjectCatalogSchema = z.object({
  scan: ProjectScanSchema,
  components: z.array(ProjectComponentSchema).max(64),
  relationships: z.array(ProjectRelationshipSchema).max(128),
  sites: z.array(ProjectSiteSchema).max(16),
}).strict();
export const ProjectContextObservationSchema = z.object({
  repositoryId: text, worldId: text, observedAt: z.string().datetime(),
  servers: z.array(ProjectServerSchema).max(32), containers: z.array(ProjectContainerSchema).max(32),
  node: ProjectScanSchema, docker: ProjectScanSchema, catalog: ProjectCatalogSchema.optional(),
}).strict();
export const ProjectContextRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION), requestId: text,
  type: z.literal("projectContext.observe"), repositoryId: text, worldId: text,
}).strict();
export type ProjectEndpoint = z.infer<typeof ProjectEndpointSchema>;
export type ProjectServer = z.infer<typeof ProjectServerSchema>;
export type ProjectContainer = z.infer<typeof ProjectContainerSchema>;
export type ProjectScan = z.infer<typeof ProjectScanSchema>;
export type ProjectContextObservation = z.infer<typeof ProjectContextObservationSchema>;
export type ProjectCatalog = z.infer<typeof ProjectCatalogSchema>;
export type ProjectComponent = z.infer<typeof ProjectComponentSchema>;
export type ProjectRelationship = z.infer<typeof ProjectRelationshipSchema>;
export type ProjectSite = z.infer<typeof ProjectSiteSchema>;
