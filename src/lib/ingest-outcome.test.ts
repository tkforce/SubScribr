import { describe, it, expect } from "vitest";
import { describeIngestOutcome } from "./ingest-outcome";
import type { IngestStats } from "@/lib/ingestion/pipeline";

// A run where everything was examined and nothing came of it. Individual tests
// override only the counts they are about, so each one reads as a single fact.
function stats(overrides: Partial<IngestStats> = {}): IngestStats {
  return {
    candidateCount: 0,
    skippedExistingCount: 0,
    blacklistedCount: 0,
    notSubscriptionCount: 0,
    missingFieldsCount: 0,
    extractFailedCount: 0,
    ingestedCount: 0,
    subscriptionsUpserted: 0,
    ...overrides,
  };
}

describe("describeIngestOutcome", () => {
  it("reports extraction failures as a warning, not as an empty result", () => {
    const outcome = describeIngestOutcome(
      stats({ candidateCount: 12, extractFailedCount: 5 }),
    );
    expect(outcome.tone).toBe("warning");
    expect(outcome.message).toContain("5");
  });

  it("prefers the failure message over the nothing-found message", () => {
    // Both conditions hold: nothing was ingested AND some emails failed to
    // parse. Folding the failure into "no subscriptions" would disguise a
    // real fault as an empty mailbox — the exact bug this function exists for.
    const outcome = describeIngestOutcome(
      stats({ candidateCount: 300, extractFailedCount: 300 }),
    );
    expect(outcome.tone).toBe("warning");
  });

  it("says no billing mail was found when Gmail returned nothing", () => {
    const outcome = describeIngestOutcome(stats({ candidateCount: 0 }));
    expect(outcome.tone).toBe("neutral");
    expect(outcome.message).toContain("90");
  });

  it("distinguishes 'all previously scanned' from 'all rejected'", () => {
    const outcome = describeIngestOutcome(
      stats({ candidateCount: 40, skippedExistingCount: 40 }),
    );
    expect(outcome.tone).toBe("neutral");
    expect(outcome.message).toContain("already scanned");
  });

  it("counts only newly examined mail when reporting rejections", () => {
    // 300 candidates, 100 already in the DB — the 200 figure is the one the
    // user can act on, so quoting 300 would overstate what this run looked at.
    const outcome = describeIngestOutcome(
      stats({
        candidateCount: 300,
        skippedExistingCount: 100,
        notSubscriptionCount: 200,
      }),
    );
    expect(outcome.tone).toBe("neutral");
    expect(outcome.message).toContain("200");
    expect(outcome.message).not.toContain("300");
  });

  it("reports a successful run with the number of billing events stored", () => {
    const outcome = describeIngestOutcome(
      stats({ candidateCount: 20, ingestedCount: 7, subscriptionsUpserted: 3 }),
    );
    expect(outcome.tone).toBe("neutral");
    expect(outcome.message).toContain("7");
  });
});
