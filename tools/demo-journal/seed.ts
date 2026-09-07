// Authoring-proof setup: actual disposable Git commits, no fabricated model output.
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { journalGit, journalDigest } from "../../core/changelog";
import { exportJournalBundle, writeJournalArtifact } from "../../core/changelog-authoring";
export async function seedJournalProof(parent: string) {
  const root = await mkdtemp(join(parent, "journal-real-repo-"));
  await journalGit(root, ["init", "--initial-branch=main"]);
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src/receipt.ts"), 'export const receipt = (change: string) => `Changed: ${change}`;\n');
  const commit = async (message: string) => {
    await journalGit(root, ["add", "--", "src/receipt.ts"]);
    await journalGit(root, ["-c", "user.name=Journal proof", "-c", "user.email=journal@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", message]);
    return (await journalGit(root, ["rev-parse", "HEAD"])).trim();
  };
  const from = await commit("Record a concise change receipt");
  const first = await exportJournalBundle(root, from, from);
  await writeFile(join(root, "src/receipt.ts"), 'export const receipt = (change: string, outcome: string) => `Changed: ${change} — Result: ${outcome}`;\n');
  const to = await commit("Include the observed outcome in each change receipt");
  const second = await exportJournalBundle(root, from, to);
  await writeJournalArtifact(root, "changelog-bundle.json", first);
  await writeFile(join(parent, "proof-first-bundle.json"), first);
  await writeFile(join(parent, "proof-second-bundle.json"), second);
  await writeFile(join(parent, "proof-repo.json"), JSON.stringify({ root, from, to, firstDigest: journalDigest(first), secondDigest: journalDigest(second) }, null, 2));
  return { root, from, to, firstDigest: journalDigest(first), secondDigest: journalDigest(second) };
}
