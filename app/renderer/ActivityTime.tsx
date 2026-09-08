/** Absolute local dates avoid midnight ambiguity without a refresh timer. */
export function ActivityTime({ at }: { at?: string | null }) {
  if (!at) return <span>Time not recorded</span>;
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return <span>Time unavailable</span>;
  const label = date.toLocaleString([], {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const exact = `${label} · ${Intl.DateTimeFormat().resolvedOptions().timeZone} · ${date.toISOString()}`;
  return <time dateTime={date.toISOString()} title={exact} aria-label={exact}>{label}</time>;
}
