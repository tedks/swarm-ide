import { Fragment, useRef, useState, type ReactNode } from "react";
import "./sidebar.css";

const names = ["Directory", "Agent runs", "Tasks"] as const;

/** Folding and resizing never unmount drafts or navigation. */
export function WorkbenchSidebar({ directory, agents, tasks }: { directory: ReactNode; agents: ReactNode; tasks: ReactNode }) {
  const [collapsed, setCollapsed] = useState([false, false, false]);
  const [sizes, setSizes] = useState([1, 1, 1]);
  const root = useRef<HTMLElement>(null);
  const drag = useRef<{ index: number; y: number; height: number; fraction: number; total: number } | null>(null);
  const resize = (index: number, fraction: number, total: number) => {
    const clamped = Math.max(.12, Math.min(.88, fraction));
    setSizes((prior) => prior.map((value, item) => item === index ? clamped * total : item === index + 1 ? (1 - clamped) * total : value));
  };
  return <aside ref={root} id="work-panel" aria-label="Work panel" className="work-rail panel split-sidebar" style={{ gridTemplateRows: sizes.flatMap((size, index) => [collapsed[index] ? "30px" : `minmax(60px, ${size}fr)`, ...(index < 2 ? ["5px"] : [])]).join(" ") }}>
    {[directory, agents, tasks].map((content, index) => <Fragment key={names[index]}>
      <section className="sidebar-section" aria-label={`${names[index]} sidebar section`}>
        <button className="sidebar-section-heading" aria-expanded={!collapsed[index]} aria-controls={`sidebar-content-${index}`} onClick={() => setCollapsed((prior) => prior.map((value, item) => item === index ? !value : value))}>
          <span aria-hidden="true">{collapsed[index] ? "›" : "⌄"}</span>{names[index]}
        </button>
        <div id={`sidebar-content-${index}`} className="sidebar-section-content" hidden={collapsed[index]}>{content}</div>
      </section>
      {index < 2 ? <div className="sidebar-divider" role="separator" aria-label={`Resize ${names[index]} and ${names[index + 1]}`} aria-orientation="horizontal" aria-valuemin={12} aria-valuemax={88} aria-valuenow={Math.round(sizes[index]! / (sizes[index]! + sizes[index + 1]!) * 100)} aria-disabled={collapsed[index] || collapsed[index + 1]} tabIndex={collapsed[index] || collapsed[index + 1] ? -1 : 0}
        onPointerDown={(event) => {
          if (event.button !== 0 || collapsed[index] || collapsed[index + 1]) return;
          const sections = root.current!.querySelectorAll<HTMLElement>(":scope > .sidebar-section");
          const upper = sections[index]!.getBoundingClientRect().height;
          const lower = sections[index + 1]!.getBoundingClientRect().height;
          drag.current = { index, y: event.clientY, height: upper + lower, fraction: upper / (upper + lower), total: sizes[index]! + sizes[index + 1]! };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => { const current = drag.current; if (current?.index === index) resize(index, current.fraction + (event.clientY - current.y) / current.height, current.total); }}
        onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={(event) => {
          if (collapsed[index] || collapsed[index + 1] || !["ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
          event.preventDefault();
          const total = sizes[index]! + sizes[index + 1]!;
          resize(index, event.key === "Home" ? .5 : sizes[index]! / total + (event.key === "ArrowUp" ? -.05 : .05), total);
        }} /> : null}
    </Fragment>)}
  </aside>;
}
