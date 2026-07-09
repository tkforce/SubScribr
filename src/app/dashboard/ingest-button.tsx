"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ingestSubscriptionEmails } from "@/app/actions/ingest";
import { Button } from "@/components/ui/button";
import type { IngestStats } from "@/lib/ingestion";
import { INGEST_WINDOW_DAYS } from "@/lib/constants";

export function IngestButton() {
  const [isIngesting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<IngestStats | null>(null);
  const router = useRouter();

  const onIngest = () => {
    setError(null);
    setStats(null);
    startTransition(async () => {
      try {
        const result = await ingestSubscriptionEmails({ force: true });
        if (!result.skipped) setStats(result.stats);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    });
  };

  return (
    <div className="mt-10 border-t pt-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onIngest} disabled={isIngesting}>
          {isIngesting ? "Ingesting…" : `Ingest ${INGEST_WINDOW_DAYS}d to DB`}
        </Button>
        {stats && (
          <span className="text-sm text-muted-foreground">
            ingested {stats.ingestedCount} · subscriptions{" "}
            {stats.subscriptionsUpserted}
          </span>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  );
}
