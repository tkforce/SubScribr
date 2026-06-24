// Time window (in days) of Gmail history we scan for subscription emails.
// Lives here so callers (server actions + UI labels) share one source of truth
// instead of the util hardcoding it. Client-safe: no server-only imports.
export const INGEST_WINDOW_DAYS = 90;
