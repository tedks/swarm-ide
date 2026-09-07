import type { Ref } from "react";
import type { ContextSection, ContextSubject } from "../../../protocol/context";
import { contextLabel } from "./compose";
import "./context.css";

export function ContextPane({ subject, sections, onOpen, headingRef }: { subject: ContextSubject | null; sections: ContextSection[]; onOpen: (path: string) => void; headingRef?: Ref<HTMLHeadingElement> }) {
  return <div className="artifact-context" data-context-kind={subject?.kind ?? "none"} data-context-subject={contextLabel(subject)}>
    <div className="instrument-heading"><div><span className="eyebrow">Context · {subject?.kind ?? "none"}</span><h2 ref={headingRef} tabIndex={-1}>{contextLabel(subject)}</h2></div></div>
    <div className="widget-grid">{sections.map((section) => <article className="widget context-section" key={section.id} data-context-section={section.id}>
      <header><span>{section.title}</span>{section.evidence ? <small data-context-freshness={section.evidence.freshness}>{section.evidence.freshness}</small> : null}</header>
      {section.notice ? <p>{section.notice}</p> : null}
      <dl>{section.rows.map((row, index) => <div key={`${index}:${row.label}`}><dt>{row.label}</dt><dd>{row.link?.kind === "source" ? <button className="source-link" onClick={() => onOpen(row.link!.kind === "source" ? row.link!.path : "")}>{row.value}</button> : row.value}</dd></div>)}</dl>
      {(section.total ?? 0) > section.rows.length ? <p>Showing {section.rows.length} of {section.total} relationships; partial display.</p> : null}
      {section.evidence ? <details><summary>Evidence · {section.evidence.provider}</summary><dl>
        <dt>Origin</dt><dd>{section.evidence.origin}</dd><dt>Revision · {section.evidence.revisionKind}</dt><dd>{section.evidence.revision}</dd>
        <dt>Observed · {section.evidence.timeBasis}</dt><dd>{section.evidence.observedAt ?? "unavailable"}</dd>
        <dt>Scope</dt><dd>{section.evidence.coverage}</dd><dt>Repository / world</dt><dd>{section.evidence.repositoryId} / {section.evidence.worldId}</dd>
      </dl></details> : null}
    </article>)}</div>
  </div>;
}
