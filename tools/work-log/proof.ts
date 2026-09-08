import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WorkLogService } from "../../core/work-log/service";
import { readWorkInputs } from "../../core/work-log/transcripts";
import { recordWorkOutcome, runWorkCommand, summarizeWork } from "../../core/work-log/commands";
import { PROTOCOL_VERSION } from "../../protocol/common";
import { WorkLogSettingsSchema } from "../../protocol/work-log";

async function main() {
  const [root, registry, proofPath] = process.argv.slice(2);
  if (!root || !registry || !proofPath) throw new Error("Usage: ABSOLUTE_REPO PRIVATE_REGISTRY PROOF_JSON; invokes one real summary and a disposable Ditz note proof");
  let calls = 0;
  const service = new WorkLogService(root, registry, { inputs: readWorkInputs, summarize: async (...args) => {
    if (++calls > 1) throw new Error("Direct proof permits one model invocation only");
    return summarizeWork(...args);
  } });
  const base = () => ({ protocolVersion: PROTOCOL_VERSION, requestId: randomUUID() });
  const signal = new AbortController().signal;
  const issue = `work-log-proof-${Date.now()}`;
  try {
    await service.request({ ...base(), type: "workLog.start", settings: WorkLogSettingsSchema.parse({ debounceSeconds: 600 }) });
    const deadline = Date.now() + 210000;
    let state = await service.request({ ...base(), type: "workLog.read" });
    while (!state.entries.length && !state.notice && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250)); state = await service.request({ ...base(), type: "workLog.read" });
    }
    await service.request({ ...base(), type: "workLog.stop" });
    if (!calls || !state.entries.length || state.notice) throw new Error(state.notice || "No new recent completed registered turn available");
    await runWorkCommand("ditz", ["add", "--id", issue, "-t", "task", "-c", "default", "--desc", "Disposable K7 verification of an idempotent generated Work Log note; not product completion.", "Work Log disposable note proof"], root, signal, "", 15000);
    await runWorkCommand("ditz", ["close", issue, "--reason", "Disposable test issue only: validates explicit completed-issue note recording."], root, signal, "", 15000);
    const common = resolve(root, (await runWorkCommand("git", ["rev-parse", "--git-common-dir"], root, signal)).trim());
    // Deliberate test binding: original model summary/session remain unchanged;
    // this copied entry targets a disposable test issue, never its worker task.
    const testEntry = { ...state.entries[0], id: `proof-${randomUUID()}`, taskId: issue };
    await recordWorkOutcome(root, common, testEntry, issue, signal);
    await recordWorkOutcome(root, common, testEntry, issue, signal);
    const readback = JSON.parse(await runWorkCommand("ditz", ["show", issue, "--json"], root, signal));
    const matching = readback.log_events.filter((event: { comment: string }) => event.comment.includes(`[swarm-work-log:${testEntry.id}]`));
    if (matching.length !== 1) throw new Error("Ditz idempotence failed");
    const document = JSON.parse(await readFile(resolve(root, ".swarm/work-log.json"), "utf8"));
    await writeFile(proofPath, JSON.stringify({ model: "gpt-5.6-luna", calls, summaries: state.entries, persisted: document.entries.length,
      disposableIssue: issue, noteCountAfterTwoWrites: matching.length, stopped: true }, null, 2));
    console.log(JSON.stringify({ calls, summaries: state.entries.length, disposableIssue: issue, noteCountAfterTwoWrites: matching.length, proofPath }));
  } finally { await service.dispose(); }
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Work Log proof failed"); process.exitCode = 1; });
