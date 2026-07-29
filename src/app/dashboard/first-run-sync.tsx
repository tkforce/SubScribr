"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEventStream } from "./use-event-stream";
import { INGEST_WINDOW_DAYS } from "@/lib/constants";
import { describeIngestOutcome } from "@/lib/ingest-outcome";
import type { IngestStats } from "@/lib/ingestion/pipeline";

type IngestDone = { stats: IngestStats | null };

// Presentation only, so both states can be seen on /dev/preview without a
// Google session — the reason the first-run path had never been eyeballed.
export function FirstRunScreen({
  progress,
  failure,
  onRetry,
}: {
  progress: string;
  failure: string | null;
  onRetry?: () => void;
}) {
  const failed = failure !== null;

  // A plain element, not <main>: the container below supplies the landmark, so
  // this can also be dropped into /dev/preview without nesting one main in
  // another.
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-6 py-16 text-center">
      <div className="glass flex h-14 w-14 items-center justify-center rounded-2xl bg-card/25">
        <Mail
          className={`h-6 w-6 ${failed ? "text-destructive" : "text-primary"}`}
          aria-hidden
        />
      </div>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        {failed ? "同步未完成" : "正在整理你的訂閱"}
      </h1>

      <p className="mt-2 text-sm text-muted-foreground">
        {failed
          ? "可以重新嘗試，已經處理過的信件不會重複計算。"
          : `正在掃描過去 ${INGEST_WINDOW_DAYS} 天的 Gmail，第一次通常需要一分鐘左右。`}
      </p>

      <div
        role="status"
        aria-live="polite"
        className="mt-8 flex min-h-6 items-center gap-2 text-sm"
      >
        {failed ? (
          <span className="text-destructive">{failure}</span>
        ) : (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
            <span className="tabular-nums text-muted-foreground">{progress}</span>
          </>
        )}
      </div>

      {failed && onRetry && (
        <Button className="mt-6" onClick={onRetry}>
          重新嘗試
        </Button>
      )}

      <p className="mt-10 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        信件內容只在記憶體中處理，不會被儲存
      </p>
    </div>
  );
}

// The whole page while a brand-new account's first sync runs.
//
// A first sync measures ~56s, and until it finishes there is nothing truthful
// to put on a dashboard: every figure would be a zero the sync has not
// finished disproving. So this replaces the dashboard rather than sitting
// inside it, and it appears exactly once per account — the moment lastIngestAt
// is written, every later visit takes the ordinary stale-while-revalidate path.
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
  // Refreshing on that would land the user on a dashboard whose empty state
  // reports no subscriptions — presenting a fault as an ordinary result. So a
  // warning keeps this screen up, where it can be stated and retried.
  const warning =
    status === "done" && result?.stats
      ? warningFrom(result.stats)
      : null;

  useEffect(() => {
    // The route wrote lastIngestAt, so refreshing swaps this screen for the
    // real dashboard — including its zero-result copy when nothing was found.
    if (status === "done" && !warning) router.refresh();
  }, [status, warning, router]);

  return (
    <main className="flex flex-1 items-center justify-center">
      <FirstRunScreen
        progress={progress}
        failure={status === "error" ? error : warning}
        onRetry={() => run()}
      />
    </main>
  );
}

function warningFrom(stats: IngestStats): string | null {
  const outcome = describeIngestOutcome(stats);
  return outcome.tone === "warning" ? outcome.message : null;
}
