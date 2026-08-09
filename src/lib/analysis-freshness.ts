// Relative-time label for the AI section's "last analyzed" readout.
// Mirrors formatLastSynced in ingest-freshness.ts down to the phrasing, so the
// two readouts on one page can't drift apart. Client-safe: pure, no server-only
// imports.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatAnalyzedAt(
  generatedAt: Date | null,
  now: Date,
): string {
  if (generatedAt === null) return "Not analyzed yet";

  // Clamp at 0: a clock skew between server render and client hydration must
  // not produce "Analyzed -1m ago".
  const diffMs = Math.max(0, now.getTime() - generatedAt.getTime());

  const minutes = Math.floor(diffMs / MINUTE_MS);
  if (minutes < 1) return "Analyzed just now";
  if (minutes < 60) return `Analyzed ${minutes}m ago`;

  const hours = Math.floor(diffMs / HOUR_MS);
  if (hours < 24) return `Analyzed ${hours}h ago`;

  return `Analyzed ${Math.floor(diffMs / DAY_MS)}d ago`;
}
