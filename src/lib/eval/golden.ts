import type { Extraction } from "@/lib/ingestion/extraction";

// One reviewable row: the email the human reads, the LLM's guess for reference,
// and `golden` — the human-arbitrated truth the eval scorer will compare against.
export type GoldenEntry = {
  id: string;
  from: string;
  subject: string;
  body: string;
  outcome: string; // carried from inspect: extracted | blacklisted | extract_failed
  llmGuess: Extraction | null;
  golden: Extraction;
  reviewed: boolean;
  note: string;
};

// The subset of an inspect-extractions result we need to seed a draft row.
export type DraftInput = {
  id: string;
  from: string;
  subject: string;
  body: string;
  outcome: string;
  extraction: Extraction | null;
};

export type BuildStats = {
  total: number;
  added: number;
  refreshed: number;
  preservedReviewed: number;
};

const NOT_SUBSCRIPTION: Extraction = { isSubscriptionRelated: false };

// Pure: turn a fresh inspect run into reviewable golden rows, preserving any
// human-reviewed labels from a prior pass. Same inputs → same output.
export function buildGoldenDraft(
  results: DraftInput[],
  existing: GoldenEntry[] = [],
): { entries: GoldenEntry[]; stats: BuildStats } {
  const existingById = new Map(existing.map((e) => [e.id, e]));
  const stats: BuildStats = { total: results.length, added: 0, refreshed: 0, preservedReviewed: 0 };

  const entries = results.map((r) => {
    const prior = existingById.get(r.id);

    // Human work wins: a reviewed row is frozen, ignore the fresh draft.
    if (prior?.reviewed) {
      stats.preservedReviewed += 1;
      return prior;
    }

    if (prior) stats.refreshed += 1;
    else stats.added += 1;

    const golden = r.extraction
      ? structuredClone(r.extraction)
      : structuredClone(NOT_SUBSCRIPTION);

    return {
      id: r.id,
      from: r.from,
      subject: r.subject,
      body: r.body,
      outcome: r.outcome,
      llmGuess: r.extraction,
      golden,
      reviewed: false,
      note: prior?.note ?? "",
    };
  });

  return { entries, stats };
}
