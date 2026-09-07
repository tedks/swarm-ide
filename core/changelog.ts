import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readWorkspaceFile } from "./files";
import { ChangelogBundleSchema, ChangelogDocumentSchema, ChangelogResultSchema, JOURNAL_BUNDLE_PATH,
  JOURNAL_DOCUMENT_PATH, JOURNAL_MAX_BYTES, validateJournalCitations, type ChangelogResult } from "../protocol/changelog";

export const journalDigest = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** Fixed Git observations only. No shell, hooks, pager, network or repo-selected executable. */
export function journalGit(root: string, args: string[], signal?: AbortSignal): Promise<string> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "PAGER"));
  return new Promise((resolve, reject) => {
    execFile("git", ["--no-replace-objects", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null",
      "-c", "core.pager=cat", "-c", "protocol.allow=never", ...args], {
      cwd: root, timeout: 4000, maxBuffer: JOURNAL_MAX_BYTES, encoding: "utf8", signal,
      env: { ...env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1" },
    }, (error, stdout) => error ? reject(new Error("Journal Git observation unavailable")) : resolve(stdout));
  });
}

export async function readJournalFile(root: string, path: string): Promise<string> {
  const file = await readWorkspaceFile(root, path);
  if (file.kind !== "read" || file.size > JOURNAL_MAX_BYTES) throw new Error("Journal input exceeds the byte bound");
  return file.content;
}

export function parseJournalPair(bundleBytes: string, documentBytes: string) {
  if (Buffer.byteLength(bundleBytes) > JOURNAL_MAX_BYTES || Buffer.byteLength(documentBytes) > JOURNAL_MAX_BYTES)
    throw new Error("Journal input exceeds the byte bound");
  const bundle = ChangelogBundleSchema.parse(JSON.parse(bundleBytes));
  const document = ChangelogDocumentSchema.parse(JSON.parse(documentBytes));
  if (document.inputDigest !== journalDigest(bundleBytes)) throw new Error("Journal generation is stale: evidence digest changed");
  if (Date.parse(document.generatedAt) < Date.parse(bundle.exportedAt)) throw new Error("Journal generation predates its input");
  validateJournalCitations(bundle, document);
  return { bundle, document };
}

export async function readChangelog(root: string, repositoryId: string, signal?: AbortSignal): Promise<ChangelogResult> {
  const bundleBytes = await readJournalFile(root, JOURNAL_BUNDLE_PATH);
  const documentBytes = await readJournalFile(root, JOURNAL_DOCUMENT_PATH);
  const pair = parseJournalPair(bundleBytes, documentBytes);
  const currentHead = (await journalGit(root, ["rev-parse", "--verify", "HEAD"], signal)).trim();
  await journalGit(root, ["merge-base", "--is-ancestor", pair.bundle.range.from, pair.bundle.range.to], signal);
  await journalGit(root, ["merge-base", "--is-ancestor", pair.bundle.range.to, currentHead], signal);
  // A refresh cannot stitch a changed pair together or publish against a moved HEAD.
  if (bundleBytes !== await readJournalFile(root, JOURNAL_BUNDLE_PATH) ||
      documentBytes !== await readJournalFile(root, JOURNAL_DOCUMENT_PATH) ||
      currentHead !== (await journalGit(root, ["rev-parse", "--verify", "HEAD"], signal)).trim())
    throw new Error("Journal sources changed during observation; Refresh again");
  if (signal?.aborted) throw new Error("Journal observation cancelled");
  return ChangelogResultSchema.parse({ repositoryId, observedAt: new Date().toISOString(), currentHead,
    state: currentHead === pair.bundle.range.to ? "recorded-head" : "recorded-ancestor", ...pair });
}
