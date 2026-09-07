import type { Ref } from "react";
import type { TaskBacklinkTarget } from "../../../protocol/tasks";
import type { ContextSubject } from "../../../protocol/context";
import { contextLabel, type ContextInstrument } from "./compose";
import "./context.css";

export function ContextPane({ subject, sections, onOpen, onTask, onRefreshTasks, headingRef }: { subject: ContextSubject | null; sections: ContextInstrument[]; onOpen: (path: string) => void; onTask?: (target: TaskBacklinkTarget) => void; onRefreshTasks?: () => void; headingRef?: Ref<HTMLHeadingElement> }) {
  return <div className="artifact-context" data-context-kind={subject?.kind ?? "none"} data-context-subject={contextLabel(subject)}>
    <div className="instrument-heading"><div><span className="eyebrow">Context · {subject?.kind ?? "none"}</span><h2 ref={headingRef} tabIndex={-1}>{contextLabel(subject)}</h2></div></div>
    <div className="widget-grid">{sections.map((section) => <article className={`widget context-section${section.empty ? " context-empty" : ""}`} key={section.id} data-context-section={section.id}>
      <header><span>{section.title}</span>{section.latency ? <small className="context-illustrative">Illustrative</small> : section.evidence ? <small data-context-freshness={section.evidence.freshness}>{section.evidence.freshness}</small> : null}</header>
      {section.empty ? <p className="context-empty-label">{section.empty}</p> : null}
      {section.notice ? <p className="context-scope">{section.notice}</p> : null}
      {section.latency ? <>
        <p className="context-latency-scope">{section.latency.scope}</p>
        <div className="context-table-scroll"><table className="context-latency-table" aria-label="Illustrative latency in milliseconds"><thead><tr><th>Operation</th><th>Mean</th><th>Median</th><th>p90</th><th>p99</th></tr></thead>
          <tbody>{section.latency.rows.map((row) => <tr key={row.operation}><th scope="row">{row.operation}</th>{[row.mean, row.median, row.p90, row.p99].map((value, index) => <td key={index}>{value.toFixed(1)}</td>)}</tr>)}</tbody>
        </table></div>
        <p className="context-scope">ms · {section.latency.window} · {section.latency.samples.toLocaleString("en-US")} example requests</p>
        <details><summary>Profile association</summary><p>{section.latency.association}</p><p>Authored demo values, not production telemetry. Named operations are not a parsed function or current cursor match.</p></details>
      </> : null}
      {section.id === "task-backlinks" ? <button type="button" onClick={onRefreshTasks}>Refresh tasks</button> : null}
      <dl>{section.rows.map((row, index) => <div key={`${index}:${row.label}`}><dt>{row.label}</dt><dd>{row.link?.kind === "source" ? <button className="source-link" onClick={() => onOpen(row.link!.kind === "source" ? row.link!.path : "")}>{row.value}</button> : row.link?.kind === "task" ? <>
        <button type="button" className="source-link" aria-label={`Inspect linked task ${row.link.target.taskId}`} onClick={() => { if (row.link?.kind === "task") onTask?.(row.link.target); }}>{row.value}</button>
        <details><summary>Task evidence · {row.link.target.taskId}</summary><dl><dt>Full ID</dt><dd>{row.link.target.taskId}</dd><dt>Issue blob</dt><dd>{row.link.target.issueBlob.algorithm}:{row.link.target.issueBlob.hex}</dd></dl></details>
      </> : row.value}</dd></div>)}</dl>
      {(section.total ?? 0) > section.rows.length ? <p>Showing {section.rows.length} of {section.total} relationships; partial display.</p> : null}
      {section.evidence ? <details><summary>Evidence · {section.evidence.provider}</summary><dl>
        <dt>Origin</dt><dd>{section.evidence.origin}</dd>{section.evidence.revisionKind !== "source-read" ? <><dt>Revision · {section.evidence.revisionKind}</dt><dd>{section.evidence.revision}</dd></> : null}
        <dt>Observed · {section.evidence.timeBasis}</dt><dd>{section.evidence.observedAt ?? "unavailable"}</dd>
        <dt>Scope</dt><dd>{section.evidence.coverage}</dd><dt>Repository / world</dt><dd>{section.evidence.repositoryId} / {section.evidence.worldId}</dd>
      </dl></details> : null}
    </article>)}</div>
  </div>;
}
