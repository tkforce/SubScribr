"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ingestSubscriptionEmails } from "@/app/actions/ingest";

// Fires a background ingest on mount when the server marked data stale, then
// refreshes the RSC payload. Stale data stays visible and interactive
// throughout (stale-while-revalidate).
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

  useEffect(() => {
    if (!stale || fired.current) return;
    fired.current = true;
    startTransition(async () => {
      try {
        await ingestSubscriptionEmails();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sync failed");
      }
    });
  }, [stale, router]);

  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
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
  );
}
