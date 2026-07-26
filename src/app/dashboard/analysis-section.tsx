"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, TrendingUp, Lightbulb } from "lucide-react";
import type { Analysis, Insight, AnalysisResult } from "@/lib/agent/analysis";
import { useAnalysisStream } from "./use-analysis-stream";
import { AiSectionShell } from "./ai-section-shell";

const PRIORITY_DOT: Record<Insight["priority"], string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

const KIND_ICON: Record<Insight["kind"], typeof AlertTriangle> = {
  alert: AlertTriangle,
  change: TrendingUp,
  observation: Lightbulb,
};

function InsightRow({ insight }: { insight: Insight }) {
  const Icon = KIND_ICON[insight.kind];
  return (
    <li className="glass rounded-xl bg-card/50 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[insight.priority]}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-sm font-semibold">{insight.title}</span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {insight.detail}
          </p>
          {insight.suggestion && (
            <p className="mt-1.5 text-xs leading-relaxed text-primary">
              {insight.suggestion}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

// Placeholder shaped like the real content (headline line + three cards) so
// the section keeps its height instead of collapsing and reflowing the page
// under it when the analysis lands.
function AnalysisSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      <div className="h-4 w-3/5 rounded bg-muted-foreground/15" />
      <ul className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <li key={i} className="glass rounded-xl bg-card/50 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/20" />
              <div className="flex-1">
                <div className="h-3.5 w-2/5 rounded bg-muted-foreground/15" />
                <div className="mt-2 h-3 w-4/5 rounded bg-muted-foreground/10" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// `initial` is the persisted analysis from the last ingest, rendered straight
// away on page load. `stale` means the event log has moved on since it was
// derived, so a fresh run fires in the background — the same
// server-decides / client-completes split AutoSync uses for ingestion.
export function AnalysisSection({
  initial,
  freshnessLabel,
  stale,
  hasSubscriptions,
}: {
  initial: Analysis | null;
  freshnessLabel: string;
  stale: boolean;
  hasSubscriptions: boolean;
}) {
  const { status, progress, result, error, run } =
    useAnalysisStream<AnalysisResult>("/api/analyze");

  // Guards against StrictMode's double-mount in dev. The server-rendered
  // `stale` prop stays true until the next full page load, so without this a
  // re-render could re-fire the run.
  const fired = useRef(false);

  useEffect(() => {
    if (!stale || !hasSubscriptions || fired.current) return;
    fired.current = true;
    run();
  }, [stale, hasSubscriptions, run]);

  const streaming = status === "streaming";
  const streamed = status === "done" ? (result?.analysis ?? null) : null;

  // The previous analysis is cleared while a new one runs, rather than kept
  // on screen stale-while-revalidate style. An analysis asserts things about
  // the current state of the log ("有 4 件事需要注意"), so once the log has
  // moved on the old text isn't merely dated — it's wrong, and sitting under
  // a spinner it still reads as current.
  const analysis = streaming ? null : (streamed ?? initial);

  return (
    <AiSectionShell
      title="訂閱分析"
      streaming={streaming}
      progress={progress}
      error={error}
      freshnessLabel={streamed ? "剛剛分析" : freshnessLabel}
    >
      {streaming ? (
        <AnalysisSkeleton />
      ) : analysis === null ? (
        <p className="text-xs text-muted-foreground">
          {hasSubscriptions ? "尚未分析。" : "尚無訂閱資料可供分析。"}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium leading-relaxed">
            {analysis.headline}
          </p>

          {analysis.insights.length > 0 && (
            <ul className="flex flex-col gap-2">
              {analysis.insights.map((i) => (
                <InsightRow key={`${i.serviceName}-${i.title}`} insight={i} />
              ))}
            </ul>
          )}
        </div>
      )}
    </AiSectionShell>
  );
}
