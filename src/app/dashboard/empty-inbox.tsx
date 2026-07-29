"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEventStream } from "./use-event-stream";
import { SyncScreen, type SyncScreenState } from "./sync-screen";
import { describeIngestOutcome } from "@/lib/ingest-outcome";
import type { IngestStats } from "@/lib/ingestion/pipeline";

type IngestDone = { stats: IngestStats | null };

// Shown once a sync has run and turned up no billing mail whatsoever.
//
// The dashboard's own empty state was a row of zeroed cards and an empty
// table, which is a lot of furniture arranged around nothing. There is one
// useful thing to say here — come back once you actually have a subscription —
// and one useful thing to do, so the page is just those two.
//
// It is not a dead end: a scan still runs automatically when the data is
// stale, which is how a user's first subscription gets discovered without
// them thinking to press anything.
export function EmptyInbox({
  stale,
  lastSyncedLabel,
  connectionExpired = false,
}: {
  stale: boolean;
  lastSyncedLabel: string;
  connectionExpired?: boolean;
}) {
  const router = useRouter();
  const { status, progress, result, error, run } = useEventStream<IngestDone>(
    "/api/ingest",
    "準備中⋯",
  );

  const fired = useRef(false);

  useEffect(() => {
    if (!stale || connectionExpired || fired.current) return;
    fired.current = true;
    run();
  }, [stale, connectionExpired, run]);

  useEffect(() => {
    // If the scan found something the server will now pick the dashboard view;
    // if it didn't, this same screen re-renders — the component stays mounted
    // through a refresh, so `status` still remembers that a scan just ran.
    if (status === "done") router.refresh();
  }, [status, router]);

  const scanning = status === "streaming";
  const failure =
    status === "error"
      ? error
      : result?.stats
        ? warningFrom(result.stats)
        : null;

  const state: SyncScreenState = scanning
    ? { kind: "working", progress }
    : failure
      ? { kind: "failed", message: failure }
      : {
          kind: "empty",
          // "Nothing found, as before" and "nothing found, just now" have to
          // read differently, or a scan that changes nothing looks like a
          // button that does nothing.
          note:
            status === "done"
              ? "剛剛重新掃描過，仍然沒有找到訂閱帳單信件。"
              : lastSyncedLabel,
        };

  return (
    <SyncScreen
      state={state}
      action={{
        label: scanning ? "掃描中⋯" : "重新掃描 Gmail",
        onClick: () => run({ force: true }),
        // Held down for the whole round-trip, not just the click, so an
        // impatient second press can't queue another 56-second scan.
        disabled: scanning || connectionExpired,
      }}
    />
  );
}

function warningFrom(stats: IngestStats): string | null {
  const outcome = describeIngestOutcome(stats);
  return outcome.tone === "warning" ? outcome.message : null;
}
