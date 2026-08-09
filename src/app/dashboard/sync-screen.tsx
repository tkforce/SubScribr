"use client";

import { Inbox, Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INGEST_WINDOW_DAYS } from "@/lib/constants";

// The three ways the page can have no dashboard to draw.
export type SyncScreenState =
  | { kind: "working"; progress: string }
  | { kind: "failed"; message: string }
  // `note` reports the outcome of a scan the user just asked for, so pressing
  // the button twice doesn't look like nothing happened.
  | { kind: "empty"; note: string | null };

const COPY = {
  working: {
    title: "Sorting out your subscriptions",
    description: `Scanning the last ${INGEST_WINDOW_DAYS} days of Gmail. The first run usually takes about a minute.`,
  },
  failed: {
    title: "Sync didn't finish",
    description:
      "You can try again — emails already processed won't be counted twice.",
  },
  empty: {
    title: "No subscriptions found",
    description: `No subscription billing emails in the last ${INGEST_WINDOW_DAYS} days of Gmail. Once you subscribe to something and the first charge or renewal notice arrives, scan again and it will show up here.`,
  },
} as const;

// Presentation only, so every state can be seen on /dev/preview without a
// Google session — this path had never been eyeballed before.
//
// Renders a plain element rather than <main>: the caller supplies the landmark,
// which also lets the preview page embed it without nesting one main inside
// another.
export function SyncScreen({
  state,
  action,
}: {
  state: SyncScreenState;
  // `onClick` is optional so /dev/preview — a server component, which cannot
  // hand a function across the boundary — can still render the affordance.
  action?: { label: string; onClick?: () => void; disabled?: boolean };
}) {
  const copy = COPY[state.kind];
  const Icon = state.kind === "empty" ? Inbox : Mail;
  const iconTone =
    state.kind === "failed"
      ? "text-destructive"
      : state.kind === "empty"
        ? "text-muted-foreground"
        : "text-primary";

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-6 py-16 text-center">
      <div className="glass flex h-14 w-14 items-center justify-center rounded-2xl bg-card/25">
        <Icon className={`h-6 w-6 ${iconTone}`} aria-hidden />
      </div>

      <h2 className="mt-6 text-2xl font-semibold tracking-tight">
        {copy.title}
      </h2>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {copy.description}
      </p>

      <div
        role="status"
        aria-live="polite"
        className="mt-8 flex min-h-6 items-center gap-2 text-sm"
      >
        {state.kind === "working" && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
            <span className="tabular-nums text-muted-foreground">
              {state.progress}
            </span>
          </>
        )}
        {state.kind === "failed" && (
          <span className="text-destructive">{state.message}</span>
        )}
        {state.kind === "empty" && state.note && (
          <span className="text-muted-foreground">{state.note}</span>
        )}
      </div>

      {action && (
        <Button
          className="mt-6"
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.label}
        </Button>
      )}

      <p className="mt-10 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        Email bodies are processed in memory and never stored
      </p>
    </div>
  );
}
