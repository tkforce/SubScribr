import { describe, it, expect } from "vitest";
import {
  AlertCardsSchema,
  hasActionableSignal,
  sortCardsByPriority,
  type AlertCard,
} from "./alert-analysis";
import type { AnomalyReport } from "@/lib/queries/anomalies";

function card(overrides: Partial<AlertCard>): AlertCard {
  return {
    priority: "medium",
    serviceName: "netflix",
    title: "標題",
    detail: "說明",
    suggestedAction: "keep",
    ...overrides,
  };
}

describe("AlertCardsSchema", () => {
  it("accepts a well-formed card set", () => {
    const parsed = AlertCardsSchema.safeParse({
      cards: [
        {
          priority: "high",
          serviceName: "netflix",
          title: "Netflix 漲價 60 元",
          detail: "標準方案從 330 漲到 390。",
          suggestedAction: "go_cancel",
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown priority", () => {
    const parsed = AlertCardsSchema.safeParse({
      cards: [{ ...card({}), priority: "urgent" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown suggestedAction", () => {
    const parsed = AlertCardsSchema.safeParse({
      cards: [{ ...card({}), suggestedAction: "delete" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts an empty card list", () => {
    expect(AlertCardsSchema.safeParse({ cards: [] }).success).toBe(true);
  });
});

describe("sortCardsByPriority", () => {
  it("orders high → medium → low", () => {
    const sorted = sortCardsByPriority([
      card({ serviceName: "a", priority: "low" }),
      card({ serviceName: "b", priority: "high" }),
      card({ serviceName: "c", priority: "medium" }),
    ]);
    expect(sorted.map((c) => c.serviceName)).toEqual(["b", "c", "a"]);
  });

  it("is stable within the same priority", () => {
    const sorted = sortCardsByPriority([
      card({ serviceName: "a", priority: "high" }),
      card({ serviceName: "b", priority: "high" }),
      card({ serviceName: "c", priority: "high" }),
    ]);
    expect(sorted.map((c) => c.serviceName)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      card({ serviceName: "a", priority: "low" }),
      card({ serviceName: "b", priority: "high" }),
    ];
    sortCardsByPriority(input);
    expect(input.map((c) => c.serviceName)).toEqual(["a", "b"]);
  });
});

describe("hasActionableSignal", () => {
  it("is false for an all-empty report", () => {
    const report: AnomalyReport = {
      duplicates: [],
      idle: [],
      priceChanges: [],
      upcomingRenewals: [],
    };
    expect(hasActionableSignal(report)).toBe(false);
  });

  it("is false for an empty object (no keys)", () => {
    expect(hasActionableSignal({})).toBe(false);
  });

  it("is true when any one category has an entry", () => {
    expect(
      hasActionableSignal({
        idle: [
          { serviceName: "spotify", cycle: "monthly", lastSeenAt: "2026-04-01", daysSinceLastSeen: 100 },
        ],
      }),
    ).toBe(true);
  });
});
