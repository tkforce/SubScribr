import { describe, it, expect } from "vitest";
import {
  detectDuplicates,
  detectIdle,
  detectPriceChanges,
  detectUpcomingRenewals,
  type AnomalySub,
  type PriceChangeEvent,
} from "./anomalies";

const NOW = new Date(2026, 6, 15); // 2026-07-15

function sub(overrides: Partial<AnomalySub>): AnomalySub {
  return {
    serviceName: "netflix",
    displayName: null,
    category: "entertainment",
    status: "active",
    cycle: "monthly",
    amountInTwd: 390,
    nextBillingDate: null,
    isTrial: false,
    trialEndsAt: null,
    lastSeenAt: new Date(2026, 6, 1),
    ...overrides,
  };
}

describe("detectDuplicates", () => {
  it("flags a category with two or more active subscriptions", () => {
    const out = detectDuplicates([
      sub({ serviceName: "netflix", category: "entertainment", amountInTwd: 390 }),
      sub({ serviceName: "disney_plus", category: "entertainment", amountInTwd: 320 }),
      sub({ serviceName: "cursor", category: "ai" }),
    ]);
    expect(out).toEqual([
      {
        category: "entertainment",
        services: ["netflix", "disney_plus"],
        combinedMonthlyTwd: 710,
      },
    ]);
  });

  it("ignores non-active subscriptions when grouping", () => {
    const out = detectDuplicates([
      sub({ serviceName: "netflix", category: "entertainment" }),
      sub({ serviceName: "disney_plus", category: "entertainment", status: "cancelled" }),
    ]);
    expect(out).toEqual([]);
  });

  it("normalizes yearly amounts into the combined monthly figure", () => {
    const out = detectDuplicates([
      sub({ serviceName: "a", category: "ai", amountInTwd: 390, cycle: "monthly" }),
      sub({ serviceName: "b", category: "ai", amountInTwd: 2400, cycle: "yearly" }),
    ]);
    expect(out).toEqual([
      { category: "ai", services: ["a", "b"], combinedMonthlyTwd: 590 }, // 390 + 200
    ]);
  });
});

describe("detectIdle", () => {
  it("flags a monthly subscription silent for more than 60 days", () => {
    const out = detectIdle(
      [sub({ serviceName: "spotify", lastSeenAt: new Date(2026, 3, 1) })], // ~105 天前
      NOW,
    );
    expect(out).toEqual([
      {
        serviceName: "spotify",
        cycle: "monthly",
        lastSeenAt: "2026-04-01",
        daysSinceLastSeen: 105,
      },
    ]);
  });

  it("does not flag a monthly subscription seen within 60 days", () => {
    const out = detectIdle(
      [sub({ lastSeenAt: new Date(2026, 5, 20) })], // 25 天前
      NOW,
    );
    expect(out).toEqual([]);
  });

  it("uses a longer threshold for yearly subscriptions", () => {
    // 300 天沒信對 yearly 來說正常（一年才一封）
    const out = detectIdle(
      [sub({ cycle: "yearly", lastSeenAt: new Date(2025, 8, 18) })],
      NOW,
    );
    expect(out).toEqual([]);
  });

  it("skips non-active and non-recurring subscriptions", () => {
    const out = detectIdle(
      [
        sub({ status: "cancelled", lastSeenAt: new Date(2025, 0, 1) }),
        sub({ serviceName: "onetime", cycle: "one-time", lastSeenAt: new Date(2025, 0, 1) }),
      ],
      NOW,
    );
    expect(out).toEqual([]);
  });
});

describe("detectPriceChanges", () => {
  function pev(overrides: Partial<PriceChangeEvent>): PriceChangeEvent {
    return {
      serviceName: "netflix",
      amount: 390,
      currency: "TWD",
      amountInTwd: 390,
      cycle: "monthly",
      emailSignalType: "billing",
      emailReceivedAt: new Date(2026, 5, 10),
      ...overrides,
    };
  }

  it("reports per-service price changes with the service name attached", () => {
    const out = detectPriceChanges([
      pev({ emailReceivedAt: new Date(2026, 3, 10), amountInTwd: 330 }),
      pev({ emailReceivedAt: new Date(2026, 5, 10), amountInTwd: 390 }),
      pev({ serviceName: "spotify", emailReceivedAt: new Date(2026, 4, 1), amountInTwd: 149 }),
      pev({ serviceName: "spotify", emailReceivedAt: new Date(2026, 5, 1), amountInTwd: 149 }),
    ]);
    expect(out).toEqual([
      {
        serviceName: "netflix",
        date: "2026-06-10",
        fromTwd: 330,
        toTwd: 390,
        pctChange: 0.182,
      },
    ]);
  });

  it("does not compare amounts across different services", () => {
    const out = detectPriceChanges([
      pev({ serviceName: "a", amountInTwd: 100, emailReceivedAt: new Date(2026, 4, 1) }),
      pev({ serviceName: "b", amountInTwd: 900, emailReceivedAt: new Date(2026, 5, 1) }),
    ]);
    expect(out).toEqual([]);
  });
});

describe("detectUpcomingRenewals", () => {
  it("flags a renewal within the 14-day window with day distance", () => {
    const out = detectUpcomingRenewals(
      [sub({ nextBillingDate: new Date(2026, 6, 20), amountInTwd: 390 })], // 5 天後
      NOW,
    );
    expect(out).toEqual([
      {
        serviceName: "netflix",
        kind: "renewal",
        date: "2026-07-20",
        daysUntil: 5,
        amountInTwd: 390,
        cycle: "monthly",
      },
    ]);
  });

  it("flags an ending trial as trial_ends", () => {
    const out = detectUpcomingRenewals(
      [
        sub({
          serviceName: "youtube_premium",
          isTrial: true,
          trialEndsAt: new Date(2026, 6, 18), // 3 天後
        }),
      ],
      NOW,
    );
    expect(out).toEqual([
      {
        serviceName: "youtube_premium",
        kind: "trial_ends",
        date: "2026-07-18",
        daysUntil: 3,
        amountInTwd: 390,
        cycle: "monthly",
      },
    ]);
  });

  it("ignores dates outside the window or in the past", () => {
    const out = detectUpcomingRenewals(
      [
        sub({ nextBillingDate: new Date(2026, 7, 15) }), // 31 天後
        sub({ serviceName: "old", nextBillingDate: new Date(2026, 6, 10) }), // 5 天前
      ],
      NOW,
    );
    expect(out).toEqual([]);
  });

  it("ignores non-active subscriptions", () => {
    const out = detectUpcomingRenewals(
      [sub({ status: "hidden", nextBillingDate: new Date(2026, 6, 20) })],
      NOW,
    );
    expect(out).toEqual([]);
  });
});
