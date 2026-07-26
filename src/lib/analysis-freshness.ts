// Relative-time label for the AI section's "last analyzed" readout.
// Mirrors formatLastSynced in ingest-freshness.ts, but in zh-TW to match the
// section's copy. Client-safe: pure, no server-only imports.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatAnalyzedAt(
  generatedAt: Date | null,
  now: Date,
): string {
  if (generatedAt === null) return "尚未分析";

  // Clamp at 0: a clock skew between server render and client hydration must
  // not produce "-1 分鐘前分析".
  const diffMs = Math.max(0, now.getTime() - generatedAt.getTime());

  const minutes = Math.floor(diffMs / MINUTE_MS);
  if (minutes < 1) return "剛剛分析";
  if (minutes < 60) return `${minutes} 分鐘前分析`;

  const hours = Math.floor(diffMs / HOUR_MS);
  if (hours < 24) return `${hours} 小時前分析`;

  return `${Math.floor(diffMs / DAY_MS)} 天前分析`;
}
