import { useLayoutEffect, useRef } from "react";
import type { DeclarationResolution } from "./declarations";
import "./declarations.css";

export function DeclarationChooser({ resolution, onChoose, onCancel }: {
  resolution: DeclarationResolution; onChoose: (path: string) => void; onCancel: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  // Focus the dialog, not its first action: the initiating Enter cannot choose.
  useLayoutEffect(() => { panel.current?.focus(); }, []);
  return <div className="declaration-overlay"><section ref={panel} role="dialog" aria-modal="true" aria-label="Choose interface declaration" tabIndex={-1}
    onKeyDown={(event) => {
      // This modal owns keyboard intent. In particular Ctrl+K must not focus a
      // hidden palette behind it, whose Enter could navigate without a choice.
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
      if (event.key === "Enter" && (event.repeat || event.target === event.currentTarget)) { event.preventDefault(); event.stopPropagation(); }
      if (event.key === "Tab") {
        const buttons = Array.from(panel.current?.querySelectorAll("button") ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.shiftKey && index <= 0 || !event.shiftKey && (index < 0 || index === buttons.length - 1)) {
          event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus();
        }
      }
    }}>
    <h2>Choose interface declaration</h2><p>{resolution.notice}</p>
    <ul>{resolution.candidates.map((candidate) => <li key={candidate.path}><button onClick={() => onChoose(candidate.path)}>
      <strong>{candidate.path}</strong><small>{candidate.relations.map((item) => `${item.role.toUpperCase()} · ${item.name} · ${item.serviceId}`).join("; ")}</small>
    </button></li>)}</ul>
    <button onClick={onCancel}>Cancel definition navigation</button>
  </section></div>;
}
