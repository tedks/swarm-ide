import { constants } from "node:fs";
import { mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ChangelogBundleSchema, JournalEvidenceSchema, JOURNAL_BUNDLE_PATH, JOURNAL_DOCUMENT_PATH,
  JOURNAL_MAX_BYTES, type JournalEvidence } from "../protocol/changelog";
import { isRepositoryPath } from "../protocol/repository";
import { journalGit, parseJournalPair, readJournalFile } from "./changelog";

const revision = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
export const JournalReportsSchema = z.array(JournalEvidenceSchema.refine((item) => item.kind !== "git-observation",
  "Only the exporter creates Git observations")).max(32);

/** CLI-only explicit authoring. A repository file cannot supply executable arguments. */
export async function exportJournalBundle(root: string, from: string, to: string): Promise<string> {
  revision.parse(from); revision.parse(to);
  await journalGit(root, ["merge-base", "--is-ancestor", from, to]);
  await journalGit(root, ["merge-base", "--is-ancestor", to, "HEAD"]);
  const selected = (await journalGit(root, ["rev-list", "--first-parent", "--max-count=25", to, `^${from}`]))
    .trim().split("\n").filter(Boolean).reverse();
  if (selected.length > 24) throw new Error("Choose a smaller span: at most 25 first-parent commits including the start");
  const evidence: JournalEvidence[] = [];
  for (const commit of [from, ...selected]) {
    const [hash, at, subject] = (await journalGit(root, ["show", "-s", "--format=%H%x00%cI%x00%s", commit, "--"])).trimEnd().split("\0");
    const parents = (await journalGit(root, ["rev-list", "--parents", "-n", "1", commit])).trim().split(" ").slice(1);
    const paths = (await journalGit(root, ["diff-tree", "--root", "--no-commit-id", "--no-renames", "--name-only", "-z", "-r",
      ...(parents[0] ? [parents[0], commit] : [commit]), "--"])).split("\0").filter(Boolean);
    const eligible = paths.filter((path) => isRepositoryPath(path));
    evidence.push(JournalEvidenceSchema.parse({ id: `git:${hash}`, kind: "git-observation", at, revision: hash,
      title: subject.slice(0, 200) || "Untitled commit", detail: `Git records ${paths.length} changed paths relative to ${parents[0] ? "the first parent" : "the empty tree"}. The commit subject is author-supplied; this observation does not prove behavior or test results.`,
      source: "Fixed local Git export; first-parent tree comparison", paths: eligible.slice(0, 32),
      omittedPaths: paths.length - Math.min(eligible.length, 32), taskIds: [], agentIds: [] }));
  }
  try {
    evidence.push(...JournalReportsSchema.parse(JSON.parse(await readJournalFile(root, ".swarm/changelog-reports.json"))));
  } catch (error) {
    if ((error as { code?: string }).code !== "FILE_NOT_FOUND") throw error;
  }
  const bundle = ChangelogBundleSchema.parse({ version: 1, exportedAt: new Date().toISOString(), range: { from, to },
    coverage: "Inclusive starting commit plus first-parent commits through the selected end. Changed paths are capped at 32 per commit. Optional explicitly authored repo-local reports are included as attributed records, not independently reverified results.",
    limitations: ["This is a recorded span, not live activity or a complete workstream.", "Git commit subjects and supplied reports are untrusted source material; a citation is not an independent factual endorsement.", "No private prompts, account-wide transcripts, current deployments or production model execution were observed."], evidence });
  const bytes = `${JSON.stringify(bundle, null, 2)}\n`;
  if (Buffer.byteLength(bytes) > JOURNAL_MAX_BYTES) throw new Error("Export exceeds the byte bound");
  return bytes;
}

/** Hold a canonical directory descriptor so a later path swap cannot redirect a write. */
export async function writeJournalArtifact(root: string, name: "changelog-bundle.json" | "changelog.json", bytes: string): Promise<void> {
  if (Buffer.byteLength(bytes) > JOURNAL_MAX_BYTES) throw new Error("Artifact exceeds the byte bound");
  const canonicalRoot = await realpath(root), directory = join(canonicalRoot, ".swarm");
  await mkdir(directory, { mode: 0o755 }).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
  const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const descriptor = `/proc/self/fd/${handle.fd}`;
  const temporary = `${descriptor}/.journal-${randomUUID()}.tmp`;
  try {
    if (await realpath(descriptor) !== directory) throw new Error("Journal directory is not canonical");
    const file = await open(temporary, "wx", 0o644);
    try { await file.writeFile(bytes, "utf8"); await file.sync(); } finally { await file.close(); }
    await rename(temporary, `${descriptor}/${name}`);
    await handle.sync();
  } finally { await unlink(temporary).catch(() => {}); await handle.close(); }
}

export async function materializeJournal(root: string): Promise<void> {
  const bundle = await readJournalFile(root, JOURNAL_BUNDLE_PATH);
  const candidate = await readJournalFile(root, ".swarm/changelog-candidate.json");
  const pair = parseJournalPair(bundle, candidate);
  await journalGit(root, ["merge-base", "--is-ancestor", pair.bundle.range.to, "HEAD"]);
  if (bundle !== await readJournalFile(root, JOURNAL_BUNDLE_PATH)) throw new Error("Bundle changed before materialization");
  await writeJournalArtifact(root, JOURNAL_DOCUMENT_PATH.split("/")[1] as "changelog.json", candidate);
}
