// Time window (in days) of Gmail history we scan for subscription emails.
// Lives here so callers (server actions + UI labels) share one source of truth
// instead of the util hardcoding it. Client-safe: no server-only imports.
export const INGEST_WINDOW_DAYS = 90;

// How old (in hours) the last ingest may be before the dashboard auto-syncs
// in the background on visit. Client-safe: no server-only imports.
export const AUTO_SYNC_THRESHOLD_HOURS = 12;
