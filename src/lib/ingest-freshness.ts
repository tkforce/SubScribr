import { AUTO_SYNC_THRESHOLD_HOURS } from "@/lib/constants";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// lastIngestAt === null means the user has never ingested (first login).
export function isIngestStale(lastIngestAt: Date | null, now: Date): boolean {
  if (lastIngestAt === null) return true;
  return (
    now.getTime() - lastIngestAt.getTime() > AUTO_SYNC_THRESHOLD_HOURS * HOUR_MS
  );
}

// Server-side gate for the ingest action: manual buttons force, the
// dashboard's background auto-sync only runs when stale.
export function shouldRunIngest(
  force: boolean,
  lastIngestAt: Date | null,
  now: Date,
): boolean {
  return force || isIngestStale(lastIngestAt, now);
}

export function formatLastSynced(
  lastIngestAt: Date | null,
  now: Date,
): string {
  if (lastIngestAt === null) return "Not synced yet";
  const diffMs = Math.max(0, now.getTime() - lastIngestAt.getTime());
  const minutes = Math.floor(diffMs / MINUTE_MS);
  if (minutes < 1) return "Last synced just now";
  if (minutes < 60) return `Last synced ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last synced ${hours}h ago`;
  return `Last synced ${Math.floor(hours / 24)}d ago`;
}
