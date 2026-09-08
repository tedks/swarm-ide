/** Glanceable local time; full date and zone stay on hover, exact instant in datetime. */
export function ActivityTime({ at }: { at?: string | null }) {
  if (!at) return <span>Time not recorded</span>;
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return <span>Time unavailable</span>;
  const today = new Date();
  const sameYear = date.getFullYear() === today.getFullYear();
  const sameDay = sameYear && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  const options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (!sameDay) {
    options.month = "short"; options.day = "numeric";
    if (!sameYear) options.year = "numeric";
  }
  const label = date.toLocaleString([], options);
  const detail = date.toLocaleString([], {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  });
  return <time dateTime={date.toISOString()} title={detail} aria-label={detail}>{label}</time>;
}
