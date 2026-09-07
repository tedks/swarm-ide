import { exportJournalBundle, materializeJournal, writeJournalArtifact } from "../../core/changelog-authoring";
import { isAbsolute } from "node:path";
import { journalDigest } from "../../core/changelog";
import { seedJournalProof } from "./seed";

async function main() {
  const [command, root, from, to, ...extra] = process.argv.slice(2);
  if (!root || !isAbsolute(root) || extra.length || !["export", "validate", "seed-proof"].includes(command))
    throw new Error("Usage: export ABSOLUTE_REPO EXACT_FROM_OID EXACT_TO_OID | validate ABSOLUTE_REPO");
  if (command === "seed-proof") {
    if (from || to) throw new Error("seed-proof takes only the explicit owned artifact directory");
    console.log(JSON.stringify(await seedJournalProof(root)));
  } else if (command === "export") {
    const bytes = await exportJournalBundle(root, from, to);
    await writeJournalArtifact(root, "changelog-bundle.json", bytes);
    console.log(`Exported .swarm/changelog-bundle.json; inputDigest ${journalDigest(bytes)}`);
  } else {
    if (from || to) throw new Error("validate takes only the explicit repository root");
    await materializeJournal(root);
    console.log("Validated citations and input digest; materialized .swarm/changelog.json. Refresh Journal in the IDE. No model was invoked.");
  }
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Journal command failed"); process.exitCode = 1; });
