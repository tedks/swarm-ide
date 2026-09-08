import { z } from "zod";
import { RepositoryPathSchema } from "./repository";

const text = z.string().min(1).max(512);
export const DeclaredServiceSchema = z.object({
  id: text, displayName: text, declarationPath: RepositoryPathSchema,
  implementationPaths: z.array(RepositoryPathSchema).max(64),
  owningTarget: text.optional(),
  interfaces: z.array(z.object({
    id: text, name: text, role: z.enum(["provided", "required"]), path: RepositoryPathSchema,
    requestType: text, responseType: text, serviceId: text.optional(),
  }).strict()).max(64),
}).strict();
export type DeclaredService = z.infer<typeof DeclaredServiceSchema>;

/** Working declarations are neither a compiled artifact nor running services. */
export const ServiceDeclarationsSchema = z.object({
  repositoryId: text, worldId: text, sourceFingerprint: text, observedAt: z.string().datetime(),
  status: z.enum(["current", "partial"]), paths: z.array(RepositoryPathSchema).max(128),
  issues: z.array(text).max(128), services: z.array(DeclaredServiceSchema).max(400),
}).strict();
export type ServiceDeclarations = z.infer<typeof ServiceDeclarationsSchema>;
