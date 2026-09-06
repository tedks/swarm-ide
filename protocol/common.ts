import { z } from "zod";

export const PROTOCOL_VERSION = 3 as const;

export const RevisionKindSchema = z.enum(["working", "built", "deployed"]);
export type RevisionKind = z.infer<typeof RevisionKindSchema>;

export const FocusRefSchema = z.object({
  worldId: z.string().min(1),
  revisionKind: RevisionKindSchema,
  revisionId: z.string().min(1),
  domain: z.enum(["repo", "service", "interface", "symbol", "design"]),
  key: z.string().min(1),
  path: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  range: z.object({
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  }).refine((range) => range.endLine >= range.startLine, {
    message: "endLine must not precede startLine",
  }).optional(),
});
export type FocusRef = z.infer<typeof FocusRefSchema>;
