import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const path = join(process.env.SWARM_ARTIFACT_DIR, "proof.json");
const proof = JSON.parse(await readFile(path, "utf8"));
if (proof.association) {
  const owner = proof.association.owner;
  const stat = await readFile(`/proc/${owner.pid}/stat`, "utf8");
  const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
  if (fields[19] !== owner.start || ["Z", "X", "x"].includes(fields[0])) throw new Error("Original agent owner changed or exited after closing the IDE");
  proof.association.originalOwnerStillRunning = true;
  await writeFile(path, JSON.stringify(proof));
  console.log("Existing tmux agent remains running after installed IDE cleanup.");
}
