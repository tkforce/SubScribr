"use client";

import { useId, useState } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";

// Chrome for the AI dashboard section: a collapsible glass card with a live
// progress readout and an inline error state.
//
// There is no re-analyze button. The analysis is derived from the BillingEvent
// log, so re-running it against unchanged data would only reword the same
// conclusions — the sync button is the single refresh affordance, and a new
// analysis follows a new ingest automatically.
//
// The header stays visible when collapsed so progress and freshness are
// readable without expanding.
export function AiSectionShell({
  title,
  streaming,
  progress,
  error,
  freshnessLabel,
  children,
}: {
  title: string;
  streaming: boolean;
  progress: string;
  error: string | null;
  freshnessLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const contentId = useId();

  return (
    <section className="glass mt-6 rounded-2xl bg-card px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={contentId}
          className="-ml-1 flex cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:text-foreground/80"
        >
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold">{title}</h2>
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
              open ? "" : "-rotate-90"
            }`}
            aria-hidden
          />
        </button>

        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          {streaming ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              <span>{progress}</span>
            </>
          ) : (
            <span>{freshnessLabel}</span>
          )}
        </p>
      </div>

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      {open && (
        <div id={contentId} className="mt-4">
          {children}
        </div>
      )}
    </section>
  );
}
