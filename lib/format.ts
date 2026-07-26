/** Formats a millisecond duration as "47m", "2h 30m", "1d 4h" — negative values (overdue) render with a leading "−". */
export function formatDuration(ms: number): string {
  const sign = ms < 0 ? "−" : "";
  const totalMinutes = Math.round(Math.abs(ms) / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${sign}${days}d ${hours}h`;
  if (hours > 0) return `${sign}${hours}h ${minutes}m`;
  return `${sign}${minutes}m`;
}

/** Formats a byte count as "840 B", "12.4 KB", "3.1 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Strips a news post's markdown down to a plain-text card preview — images
 * before links (an image's `![alt](url)` would otherwise leave a stray `!`
 * if the link regex ran first), then headings/emphasis/code markers, then
 * collapses whitespace and truncates. Not a markdown parser — just enough
 * regex to keep a preview readable.
 */
export function markdownSnippet(markdown: string, maxLength = 140): string {
  const plain = markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~`>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}
