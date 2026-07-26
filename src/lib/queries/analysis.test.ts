import { describe, it, expect } from "vitest";
import { isAnalysisStale, parseAnalysisPayload } from "./analysis";
import type { Analysis } from "@/lib/agent/analysis";

const VALID: Analysis = {
  headline: "本月支出增加 NT$106。",
  insights: [
    {
      kind: "alert",
      priority: "high",
      serviceName: "netflix",
      title: "Netflix 漲價",
      detail: "從 330 漲到 390 TWD。",
      suggestion: "確認這個漲幅是否仍值得續訂。",
    },
  ],
};

const JAN = new Date("2026-01-01T00:00:00Z");
const FEB = new Date("2026-02-01T00:00:00Z");

const V2 = "v2-cards-only";

function stored(basedOnIngestAt: Date, promptVersion = V2) {
  return { basedOnIngestAt, promptVersion };
}

describe("isAnalysisStale", () => {
  it("is stale when there is no stored analysis", () => {
    expect(isAnalysisStale(null, JAN, V2)).toBe(true);
  });

  it("is stale when an ingest ran after the analysis was generated", () => {
    expect(isAnalysisStale(stored(JAN), FEB, V2)).toBe(true);
  });

  it("is fresh when the analysis was derived from the latest ingest", () => {
    expect(isAnalysisStale(stored(JAN), JAN, V2)).toBe(false);
  });

  it("is fresh when the analysis is somehow newer than the last ingest", () => {
    // Can happen if an analysis is written while lastIngestAt is being read;
    // treat it as current rather than looping forever on re-analysis.
    expect(isAnalysisStale(stored(FEB), JAN, V2)).toBe(false);
  });

  it("is stale when the user has never ingested", () => {
    // No ingest means no events, so any stored analysis is meaningless.
    expect(isAnalysisStale(stored(JAN), null, V2)).toBe(true);
    expect(isAnalysisStale(null, null, V2)).toBe(true);
  });

  it("is stale when the analysis came from an older prompt version", () => {
    // Zod strips unknown keys rather than rejecting, so an old payload still
    // parses — it just silently loses the fields the new schema dropped.
    // The version stamp is what actually forces a regeneration.
    expect(isAnalysisStale(stored(JAN, "v1-merged-8a8b"), JAN, V2)).toBe(true);
  });
});

describe("parseAnalysisPayload", () => {
  it("returns the analysis for a well-formed payload", () => {
    expect(parseAnalysisPayload(VALID)).toEqual(VALID);
  });

  it("returns null when the payload no longer matches the schema", () => {
    // Self-healing: a schema change makes old rows unreadable rather than
    // crashing, so the next ingest simply regenerates them.
    expect(parseAnalysisPayload({ headline: "只有標題" })).toBeNull();
  });

  it("returns null for a non-object payload", () => {
    expect(parseAnalysisPayload(null)).toBeNull();
    expect(parseAnalysisPayload("not json")).toBeNull();
  });

  it("returns null when an insight has an unknown kind", () => {
    expect(
      parseAnalysisPayload({
        ...VALID,
        insights: [{ ...VALID.insights[0], kind: "warning" }],
      }),
    ).toBeNull();
  });
});
