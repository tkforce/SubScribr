import { INGEST_WINDOW_DAYS } from "@/lib/constants";
// Type-only: erased at compile time, so this stays client-safe despite
// pipeline.ts pulling in Prisma and the Gmail client.
import type { IngestStats } from "@/lib/ingestion/pipeline";

export type IngestOutcome = {
  tone: "neutral" | "warning";
  message: string;
};

// Turns an ingest run's counters into the one sentence worth showing.
//
// Exists because every way a run can end with no subscriptions used to render
// the identical screen — "your mailbox has none" and "every extraction call
// failed" were indistinguishable, so a real fault read as an empty state.
// Hence the ordering below: failures are reported before emptiness.
export function describeIngestOutcome(stats: IngestStats): IngestOutcome {
  const examined = stats.candidateCount - stats.skippedExistingCount;

  if (stats.extractFailedCount > 0) {
    return {
      tone: "warning",
      message: `${stats.extractFailedCount} ${stats.extractFailedCount === 1 ? "email" : "emails"} could not be read — probably temporary. Syncing again later will pick them up.`,
    };
  }

  if (stats.candidateCount === 0) {
    return {
      tone: "neutral",
      message: `No billing emails in the last ${INGEST_WINDOW_DAYS} days.`,
    };
  }

  if (examined === 0) {
    return {
      tone: "neutral",
      message: `All ${stats.candidateCount} candidate emails were already scanned — nothing new.`,
    };
  }

  if (stats.ingestedCount === 0) {
    return {
      tone: "neutral",
      message: `Read ${examined} billing ${examined === 1 ? "email" : "emails"} — none of them is a recurring subscription.`,
    };
  }

  return {
    tone: "neutral",
    message: `Recorded subscriptions from ${stats.ingestedCount} ${stats.ingestedCount === 1 ? "email" : "emails"}.`,
  };
}
