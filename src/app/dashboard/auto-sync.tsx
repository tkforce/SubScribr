"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEventStream } from "./use-event-stream";
import { useSyncStatus } from "./sync-status";
import { describeIngestOutcome } from "@/lib/ingest-outcome";
import type { IngestStats } from "@/lib/ingestion/pipeline";

type IngestDone = { stats: IngestStats | null };

// Fires a background ingest on mount when the server marked data stale, then
// refreshes the RSC payload. Also hosts the manual "sync now" button, which
// forces past the server-side freshness gate.
//
// Existing data stays visible and interactive throughout; sections with
// nothing to show swap to skeletons instead (see SyncAware).
export function AutoSync({
  stale,
  lastSyncedLabel,
  connectionExpired = false,
}: {
  stale: boolean;
  lastSyncedLabel: string;
  // Gmail refresh token is gone — syncing can only fail, so don't auto-fire
  // and disable the manual button. The dashboard banner owns the messaging.
  connectionExpired?: boolean;
}) {
  const router = useRouter();
  const { setSyncing } = useSyncStatus();
  const { status, progress, result, error, run } = useEventStream<IngestDone>(
    "/api/ingest",
    "Preparing to sync…",
  );

  // Guards against StrictMode double-mount in dev; after a successful sync
  // router.refresh() re-renders us with stale=false, so no re-fire either way.
  const fired = useRef(false);

  const isSyncing = status === "streaming";

  useEffect(() => {
    setSyncing(isSyncing);
  }, [isSyncing, setSyncing]);

  useEffect(() => {
    if (!stale || connectionExpired || fired.current) return;
    fired.current = true;
    run();
  }, [stale, connectionExpired, run]);

  useEffect(() => {
    if (status === "done") router.refresh();
  }, [status, router]);

  // A run can succeed as a request and still be worth reporting — most of all
  // when extraction failed on every email, which would otherwise reach the
  // user as an ordinary empty dashboard.
  const warning = warningFrom(result);

  const runManually = useCallback(() => run({ force: true }), [run]);

  return (
    <div className="flex items-center gap-1">
      <p
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 text-s text-muted-foreground"
      >
        {isSyncing ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            <span className="tabular-nums">{progress}</span>
          </>
        ) : (
          <span>{lastSyncedLabel}</span>
        )}
        {error && !connectionExpired && (
          <span className="text-destructive">{error}</span>
        )}
        {!error && warning && <span className="text-destructive">{warning}</span>}
      </p>
      <Button
        variant="ghost"
        className="cursor-pointer rounded-full p-1 text-muted-foreground hover:text-foreground"
        size="icon-xs"
        aria-label="Sync now"
        disabled={isSyncing || connectionExpired}
        onClick={runManually}
      >
        <RefreshCw aria-hidden />
      </Button>
    </div>
  );
}

function warningFrom(result: IngestDone | null): string | null {
  if (!result?.stats) return null;
  const outcome = describeIngestOutcome(result.stats);
  return outcome.tone === "warning" ? outcome.message : null;
}
