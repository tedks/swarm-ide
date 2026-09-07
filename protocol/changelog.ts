import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";
import { RepositoryPathSchema } from "./repository";

export const JOURNAL_BUNDLE_PATH = ".swarm/changelog-bundle.json";
export const JOURNAL_DOCUMENT_PATH = ".swarm/changelog.json";
export const JOURNAL_MAX_BYTES = 512 * 1024;
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/);
const oid = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const text = (max: number) => z.string().min(1).max(max).refine((value) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value), "Control characters are not narrative text");
export const JournalEvidenceSchema = z.object({
  id, kind: z.enum(["git-observation", "agent-report", "recorded-check", "recorded-artifact", "synthetic"]),
  at: z.string().datetime({ offset: true }), revision: oid,
  title: text(200), detail: text(4000), source: text(240),
  paths: z.array(RepositoryPathSchema).max(32), omittedPaths: z.number().int().nonnegative(),
  taskIds: z.array(id).max(8), agentIds: z.array(id).max(8),
}).strict();
export type JournalEvidence = z.infer<typeof JournalEvidenceSchema>;
export const ChangelogBundleSchema = z.object({
  version: z.literal(1), exportedAt: z.string().datetime({ offset: true }),
  range: z.object({ from: oid, to: oid }).strict(),
  coverage: text(2000), limitations: z.array(text(600)).min(1).max(16),
  evidence: z.array(JournalEvidenceSchema).min(1).max(128),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.evidence.map((item) => item.id)).size !== value.evidence.length)
    ctx.addIssue({ code: "custom", message: "Duplicate evidence IDs" });
});
export type ChangelogBundle = z.infer<typeof ChangelogBundleSchema>;
const claim = z.object({ text: text(1200), evidenceIds: z.array(id).min(1).max(12) }).strict();
export const JournalEntrySchema = z.object({
  id, headline: text(160), intent: claim, outcome: claim, decision: claim,
  state: z.enum(["completed", "in-progress", "blocked", "mixed", "unknown"]),
  reasoning: z.enum(["reported", "reconstructed"]),
  // Ordering in the list is presentation only, not a dependency/causality claim.
  caveats: z.array(text(600)).max(8),
}).strict();
export type JournalEntry = z.infer<typeof JournalEntrySchema>;
export const ChangelogDocumentSchema = z.object({
  version: z.literal(1), inputDigest: digest, generatedAt: z.string().datetime({ offset: true }),
  generator: z.object({ kind: z.literal("supervised-agent"), name: text(120), run: id,
    instructionsDigest: digest }).strict(),
  entries: z.array(JournalEntrySchema).min(1).max(24),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.entries.map((entry) => entry.id)).size !== value.entries.length)
    ctx.addIssue({ code: "custom", message: "Duplicate change IDs" });
});
export type ChangelogDocument = z.infer<typeof ChangelogDocumentSchema>;

/** Structural validation is not a factual endorsement of generated language. */
export function validateJournalCitations(bundle: ChangelogBundle, document: ChangelogDocument): void {
  const known = new Set(bundle.evidence.map((item) => item.id));
  for (const entry of document.entries)
    for (const claim of [entry.intent, entry.outcome, entry.decision])
      for (const reference of claim.evidenceIds)
        if (!known.has(reference)) throw new Error(`Unknown Journal evidence ID: ${reference}`);
}
export function entryEvidence(entry: JournalEntry, bundle: ChangelogBundle): JournalEvidence[] {
  const ids = new Set([entry.intent, entry.outcome, entry.decision].flatMap((claim) => claim.evidenceIds));
  return bundle.evidence.filter((item) => ids.has(item.id));
}

export const ChangelogRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION), requestId: z.string().min(1),
  type: z.literal("changelog.read"), repositoryId: z.string().min(1).max(256),
}).strict();
export const ChangelogResultSchema = z.object({
  repositoryId: z.string().min(1).max(256), observedAt: z.string().datetime(),
  currentHead: oid, state: z.enum(["recorded-head", "recorded-ancestor"]),
  bundle: ChangelogBundleSchema, document: ChangelogDocumentSchema,
}).strict().superRefine((value, ctx) => {
  try { validateJournalCitations(value.bundle, value.document); }
  catch { ctx.addIssue({ code: "custom", message: "Unknown narrative citation" }); }
  if ((value.currentHead === value.bundle.range.to) !== (value.state === "recorded-head"))
    ctx.addIssue({ code: "custom", message: "Journal coverage state disagrees with observed HEAD" });
});
export type ChangelogResult = z.infer<typeof ChangelogResultSchema>;
