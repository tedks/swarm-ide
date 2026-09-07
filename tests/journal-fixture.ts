// Synthetic contract fixture only. This does not prove actual model synthesis.
import type { ChangelogBundle, ChangelogDocument, ChangelogResult } from "../protocol/changelog";
import { journalDigest } from "../core/changelog";
export function syntheticJournal() {
  const bundle: ChangelogBundle = { version: 1, exportedAt: "2026-09-07T12:00:00Z", range: { from: "a".repeat(40), to: "b".repeat(40) },
    coverage: "Synthetic unit fixture", limitations: ["Not an actual generation"], evidence: [{ id: "evidence:a", kind: "synthetic", at: "2026-09-07T12:00:00Z",
      revision: "b".repeat(40), title: "Controlled evidence", detail: "A synthetic implementation observation", source: "Synthetic unit fixture",
      paths: ["src/example.ts"], omittedPaths: 0, taskIds: ["task-a"], agentIds: ["agent-a"] }] };
  const bytes = `${JSON.stringify(bundle)}\n`;
  const claim = { text: "Synthetic narrative", evidenceIds: ["evidence:a"] };
  const document: ChangelogDocument = { version: 1, inputDigest: journalDigest(bytes), generatedAt: "2026-09-07T12:01:00Z",
    generator: { kind: "supervised-agent", name: "Synthetic schema fixture, not a model", run: "unit-fixture", instructionsDigest: "c".repeat(64) },
    entries: [{ id: "change-a", headline: "Synthetic change", intent: claim, outcome: claim, decision: claim,
      state: "unknown", reasoning: "reconstructed", caveats: ["Synthetic fixture, not an actual model turn"] }] };
  const result: ChangelogResult = { repositoryId: "repo:test", observedAt: "2026-09-07T12:02:00Z", currentHead: "b".repeat(40), state: "recorded-head", bundle, document };
  return { bundle, document, bytes, result };
}
