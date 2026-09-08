import { useMemo, useRef, useState, type DragEventHandler, type MouseEventHandler } from "react";

export type TabDragProps = {
  draggable: true;
  "data-tab-dragging"?: "true";
  "data-tab-drop"?: "before" | "after";
  onDragStart: DragEventHandler<HTMLElement>;
  onDragOver: DragEventHandler<HTMLElement>;
  onDrop: DragEventHandler<HTMLElement>;
  onDragEnd: DragEventHandler<HTMLElement>;
  onClickCapture: MouseEventHandler<HTMLElement>;
};

/** Session-local visual order for a changing collection of stable tab keys. */
export function useTabOrder<Key extends string>(keys: readonly Key[]) {
  const [saved, setSaved] = useState<readonly Key[]>(keys);
  const [drag, setDrag] = useState<{ source: Key; target?: Key; edge?: "before" | "after" } | null>(null);
  const suppressClickAt = useRef<number | null>(null);
  const ordered = useMemo(() => {
    const available = new Set(keys);
    return [...saved.filter((key) => available.has(key)), ...keys.filter((key) => !saved.includes(key))];
  }, [keys, saved]);

  const props = (key: Key): TabDragProps => ({
    draggable: true,
    ...(drag?.source === key ? { "data-tab-dragging": "true" as const } : {}),
    ...(drag?.target === key && drag.source !== key && drag.edge ? { "data-tab-drop": drag.edge } : {}),
    onDragStart(event) {
      event.dataTransfer.effectAllowed = "move";
      setDrag({ source: key });
    },
    onDragOver(event) {
      if (!drag || drag.source === key) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const box = event.currentTarget.getBoundingClientRect();
      const edge = event.clientX < box.left + box.width / 2 ? "before" : "after";
      if (drag.target !== key || drag.edge !== edge) setDrag({ ...drag, target: key, edge });
    },
    onDrop(event) {
      event.preventDefault();
      if (!drag || drag.source === key) { setDrag(null); return; }
      const box = event.currentTarget.getBoundingClientRect();
      const edge = event.clientX < box.left + box.width / 2 ? "before" : "after";
      setSaved(() => {
        const next = ordered.filter((candidate) => candidate !== drag.source);
        const target = next.indexOf(key);
        next.splice(target + (edge === "after" ? 1 : 0), 0, drag.source);
        return next;
      });
      suppressClickAt.current = Date.now();
      setDrag(null);
    },
    onDragEnd() {
      if (drag) suppressClickAt.current = Date.now();
      setDrag(null);
    },
    onClickCapture(event) {
      if (suppressClickAt.current !== null && Date.now() - suppressClickAt.current < 250) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickAt.current = null;
      }
    },
  });
  return { ordered, props };
}
