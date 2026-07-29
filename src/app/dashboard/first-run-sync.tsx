"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEventStream } from "./use-event-stream";
import { SyncScreen, type SyncScreenState } from "./sync-screen";
import { describeIngestOutcome } from "@/lib/ingest-outcome";
import type { IngestStats } from "@/lib/ingestion/pipeline";

type IngestDone = { stats: IngestStats | null };

// The whole page while a brand-new account's first sync runs.
//
// A first sync measures ~56s, and until it finishes there is nothing truthful
// to put on a dashboard: every figure would be a zero the sync has not
// finished disproving. So this replaces the dashboard rather than sitting
// inside it, and it appears exactly once per account — the moment lastIngestAt
// is written, every later visit takes one of the other two views.
export function FirstRunSync() {
  const router = useRouter();
  const { status, progress, result, error, run } = useEventStream<IngestDone>(
    "/api/ingest",
    "準備中⋯",
  );

  // Guards against StrictMode's double-mount in dev. On success we navigate
  // away from this component entirely, so there is no re-fire either way.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    run();
  }, [run]);

  // A run can come back "successful" having failed to read every single email.
  // Refreshing on that would land the user on the "nothing found" screen —
  // presenting a fault as an ordinary result. So a warning keeps this screen
  // up, where it can be stated and retried.
  const warning =
    status === "done" && result?.stats ? warningFrom(result.stats) : null;

  useEffect(() => {
    // The route wrote lastIngestAt, so refreshing hands the page to whichever
    // view the server now picks — the dashboard, or the empty-inbox screen.
    if (status === "done" && !warning) router.refresh();
  }, [status, warning, router]);

  const failure = status === "error" ? error : warning;
  const state: SyncScreenState = failure
    ? { kind: "failed", message: failure }
    : { kind: "working", progress };

  return (
    <main className="flex flex-1 items-center justify-center">
      <SyncScreen
        state={state}
        action={
          failure
            ? { label: "重新嘗試", onClick: () => run({ force: true }) }
            : undefined
        }
      />
    </main>
  );
}

function warningFrom(stats: IngestStats): string | null {
  const outcome = describeIngestOutcome(stats);
  return outcome.tone === "warning" ? outcome.message : null;
}
