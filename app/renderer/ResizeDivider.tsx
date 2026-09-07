import { useRef } from "react";
import "./workspace-layout.css";

export function ResizeDivider({ label, className, container, value, minimum, maximum, initial, reverse = false, onChange }: {
  label: string; className: string; container: string; value: number; minimum: number; maximum: number; initial: number; reverse?: boolean; onChange: (value: number) => void;
}) {
  const drag = useRef<{ id: number; left: number; width: number } | null>(null);
  const update = (next: number) => onChange(Math.min(maximum, Math.max(minimum, next)));
  return <div className={`workspace-divider ${className}`} role="separator" aria-label={label} aria-orientation="vertical" aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={Math.round(value)} tabIndex={0}
    onPointerDown={(event) => { if (event.button !== 0) return; const rect = event.currentTarget.closest(container)?.getBoundingClientRect(); if (!rect?.width) return; event.preventDefault(); drag.current = { id: event.pointerId, left: rect.left, width: rect.width }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={(event) => { const start = drag.current; if (!start || start.id !== event.pointerId) return; const share = (event.clientX - start.left) / start.width * 100; update(reverse ? 100 - share : share); }}
    onPointerUp={(event) => { if (drag.current?.id === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); } }}
    onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
    onDoubleClick={() => update(initial)}
    onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); update(event.key === "Home" ? initial : value + (event.key === "ArrowRight" ? 1 : -1) * (reverse ? -1 : 1)); }} />;
}
