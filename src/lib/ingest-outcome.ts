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
      message: `${stats.extractFailedCount} 封信件判讀失敗，可能是暫時性問題，稍後重新同步即可。`,
    };
  }

  if (stats.candidateCount === 0) {
    return {
      tone: "neutral",
      message: `過去 ${INGEST_WINDOW_DAYS} 天沒有找到帳單類信件。`,
    };
  }

  if (examined === 0) {
    return {
      tone: "neutral",
      message: `${stats.candidateCount} 封信件先前皆已掃描，沒有新的訂閱紀錄。`,
    };
  }

  if (stats.ingestedCount === 0) {
    return {
      tone: "neutral",
      message: `掃描了 ${examined} 封帳單類信件，都不是定期訂閱。`,
    };
  }

  return {
    tone: "neutral",
    message: `從 ${stats.ingestedCount} 封信件建立了訂閱紀錄。`,
  };
}
