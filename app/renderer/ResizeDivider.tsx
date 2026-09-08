import { useRef } from "react";
import "./workspace-layout.css";

export function ResizeDivider({ label, className, container, value, minimum, maximum, initial, reverse = false, axis = "x", onChange }: {
  label: string; className: string; container: string; value: number; minimum: number; maximum: number; initial: number; reverse?: boolean; axis?: "x" | "y"; onChange: (value: number) => void;
}) {
  const drag = useRef<{ id: number; left: number; width: number } | null>(null);
  const update = (next: number) => onChange(Math.min(maximum, Math.max(minimum, next)));
  return <div className={`workspace-divider ${className}`} role="separator" aria-label={label} aria-orientation={axis === "x" ? "vertical" : "horizontal"} aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={Math.round(value)} tabIndex={0}
    onPointerDown={(event) => { if (event.button !== 0) return; const rect = event.currentTarget.closest(container)?.getBoundingClientRect(); const size = rect && (axis === "x" ? rect.width : rect.height); if (!size) return; event.preventDefault(); drag.current = { id: event.pointerId, left: axis === "x" ? rect!.left : rect!.top, width: size }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={(event) => { const start = drag.current; if (!start || start.id !== event.pointerId) return; const share = ((axis === "x" ? event.clientX : event.clientY) - start.left) / start.width * 100; update(reverse ? 100 - share : share); }}
    onPointerUp={(event) => { if (drag.current?.id === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); } }}
    onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
    onDoubleClick={() => update(initial)}
    onKeyDown={(event) => { const increase = axis === "x" ? "ArrowRight" : "ArrowDown", decrease = axis === "x" ? "ArrowLeft" : "ArrowUp"; if (![increase, decrease, "Home"].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); update(event.key === "Home" ? initial : value + (event.key === increase ? 1 : -1) * (reverse ? -1 : 1)); }} />;
}
