"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { ingestSubscriptionEmails } from "@/app/actions/ingest";
import { Button } from "@/components/ui/button";

// Fires a background ingest on mount when the server marked data stale, then
// refreshes the RSC payload. Stale data stays visible and interactive
// throughout (stale-while-revalidate). Also hosts the manual "sync now"
// button, which forces past the server-side freshness gate.
export function AutoSync({
  stale,
  lastSyncedLabel,
}: {
  stale: boolean;
  lastSyncedLabel: string;
}) {
  const [isSyncing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Guards against StrictMode double-mount in dev; after a successful sync
  // router.refresh() re-renders us with stale=false, so no re-fire either way.
  const fired = useRef(false);
  const router = useRouter();

  const runSync = useCallback(
    (options?: { force: boolean }) => {
      setError(null);
      startTransition(async () => {
        try {
          await ingestSubscriptionEmails(options);
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Sync failed");
        }
      });
    },
    [router, startTransition],
  );

  useEffect(() => {
    if (!stale || fired.current) return;
    fired.current = true;
    runSync();
  }, [stale, runSync]);

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
            <span>Syncing…</span>
          </>
        ) : (
          <span>{lastSyncedLabel}</span>
        )}
        {error && <span className="text-destructive">{error}</span>}
      </p>
      <Button
        variant="ghost"
        className="cursor-pointer rounded-full p-1 text-muted-foreground hover:text-foreground"
        size="icon-xs"
        aria-label="Sync now"
        disabled={isSyncing}
        onClick={() => runSync({ force: true })}
      >
        <RefreshCw aria-hidden />
      </Button>
    </div>
  );
}
