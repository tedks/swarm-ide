import type { WorkspaceSnapshot } from "../../../protocol/schema";
import "./context.css";

export function GlobalContext({ snapshot, ready }: { snapshot: WorkspaceSnapshot; ready: boolean }) {
  const { working, built, deployed } = snapshot.revisions;
  const workingKnown = working.evidence === "observed" && Boolean(working.fingerprint);
  const builtCurrent = ready && workingKnown && built.sourceFingerprint === working.fingerprint && snapshot.reconciliation.status === "green";
  const short = (id: string) => id.length > 12 ? id.slice(0, 8) : id;
  return <section className="context-global" aria-label="Context Global">
    <header><span className="eyebrow">Context · Global</span><small>{snapshot.world.label}</small></header>
    <dl>
      <div><dt>Working</dt><dd>{workingKnown ? short(working.id) : "Not observed"}<small>{workingKnown ? ready ? "Observed source" : "Retained source" : "Awaiting source observation"}</small></dd></div>
      <div><dt>Built</dt><dd>{built.id ? short(built.id) : "Not built"}<small>{built.id ? builtCurrent ? "Matches working source" : "Retained build" : "No compiled snapshot"}</small></dd></div>
      <div><dt>Deployed</dt><dd>{deployed.id ? deployed.environment : "Not configured"}<small>{deployed.id ? `Recorded deployment · ${short(deployed.id)}` : "No deployment observation"}</small></dd></div>
    </dl>
  </section>;
}
