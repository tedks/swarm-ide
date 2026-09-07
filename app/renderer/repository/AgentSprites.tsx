/** Deliberately display-only: no client, timer, model, or agent-run identity. */
export function AgentSprites({ count }: { count: number }) {
  return <span className="directory-agents" role="img" aria-label={`${count} mock agents · visual preview only`}>
    {Array.from({ length: Math.min(count, 3) }, (_, index) => <svg key={index} className={`directory-agent sprite-${index}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v3m-1-4h2M5 11H3v6h2m14-6h2v6h-2M8 20v2m8-2v2" />
      <rect x="5" y="6" width="14" height="14" rx="4" /><path d="M9 16h6" /><circle cx="9" cy="11" r="1" /><circle cx="15" cy="11" r="1" />
    </svg>)}<small>mock</small>
  </span>;
}
