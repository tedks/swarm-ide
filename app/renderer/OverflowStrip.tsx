import { useLayoutEffect, useRef, useState, type ReactElement } from "react";

/** Keeps the existing nav/tablist and its native input behavior intact. */
export function OverflowStrip({ children, label, className = "", activeKey }: {
  children: ReactElement; label: string; className?: string; activeKey: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const reveal = useRef(() => {});
  const move = useRef((_direction: number) => {});
  const [edges, setEdges] = useState({ overflowing: false, left: false, right: false });
  useLayoutEffect(() => {
    const strip = root.current?.firstElementChild as HTMLElement | null;
    if (!strip) return;
    let live = true;
    const measure = () => {
      if (!live) return;
      const maximum = Math.max(0, strip.scrollWidth - strip.clientWidth);
      const next = { overflowing: maximum > 1, left: strip.scrollLeft > 1, right: strip.scrollLeft < maximum - 1 };
      setEdges((prior) => prior.overflowing === next.overflowing && prior.left === next.left && prior.right === next.right ? prior : next);
    };
    const scroll = (amount: number) => {
      strip.scrollLeft = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, strip.scrollLeft + amount));
      measure();
    };
    reveal.current = () => {
      const selected = strip.querySelector<HTMLElement>('[aria-selected="true"], .surface-tab.active, .active');
      if (selected && strip.clientWidth > 0) {
        const box = strip.getBoundingClientRect(), tab = selected.getBoundingClientRect();
        if (tab.left < box.left) scroll(tab.left - box.left);
        else if (tab.right > box.right) scroll(tab.right - box.right);
      }
      measure();
    };
    move.current = (direction) => scroll(direction * Math.max(72, strip.clientWidth * .7));
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => reveal.current());
    resize?.observe(strip);
    const changes = new MutationObserver(measure);
    changes.observe(strip, { childList: true, subtree: true, characterData: true });
    strip.addEventListener("scroll", measure, { passive: true });
    reveal.current();
    return () => { live = false; resize?.disconnect(); changes.disconnect(); strip.removeEventListener("scroll", measure); reveal.current = () => {}; move.current = () => {}; };
  }, []);
  useLayoutEffect(() => reveal.current(), [activeKey]);
  return <div ref={root} className={`overflow-strip ${className}`}>
    {children}
    <div className="overflow-strip-actions">{edges.overflowing ? <>
      <button type="button" aria-label={`Scroll ${label} left`} title={`Scroll ${label} left`} disabled={!edges.left} onClick={() => move.current(-1)}>‹</button>
      <button type="button" aria-label={`Scroll ${label} right`} title={`Scroll ${label} right`} disabled={!edges.right} onClick={() => move.current(1)}>›</button>
    </> : null}</div>
  </div>;
}
