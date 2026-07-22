import { describe, it, expect } from "vitest";
import {
  computeMonthDelta,
  computeMonthlySpend,
  computeServiceHistory,
  type ServiceHistoryEvent,
  type TrendEvent,
} from "./monthly-trend";

// now 固定在 2026-07-15，6 個月窗 = 2026-02 .. 2026-07
const NOW = new Date(2026, 6, 15);

function ev(overrides: Partial<TrendEvent>): TrendEvent {
  return {
    amountInTwd: 100,
    cycle: "monthly",
    emailSignalType: "billing",
    emailReceivedAt: new Date(2026, 6, 1),
    ...overrides,
  };
}

describe("computeMonthlySpend", () => {
  it("returns monthsBack zeroed points for empty input", () => {
    const points = computeMonthlySpend([], 6, NOW);
    expect(points).toEqual([
      { month: "2026-02", totalTwd: 0 },
      { month: "2026-03", totalTwd: 0 },
      { month: "2026-04", totalTwd: 0 },
      { month: "2026-05", totalTwd: 0 },
      { month: "2026-06", totalTwd: 0 },
      { month: "2026-07", totalTwd: 0 },
    ]);
  });

  it("counts a monthly billing in its own calendar month only", () => {
    const points = computeMonthlySpend(
      [ev({ amountInTwd: 390, emailReceivedAt: new Date(2026, 4, 10) })],
      6,
      NOW,
    );
    expect(points.find((p) => p.month === "2026-05")?.totalTwd).toBe(390);
    expect(points.find((p) => p.month === "2026-04")?.totalTwd).toBe(0);
    expect(points.find((p) => p.month === "2026-06")?.totalTwd).toBe(0);
  });

  it("counts consecutive monthly billings in consecutive months", () => {
    const points = computeMonthlySpend(
      [
        ev({ amountInTwd: 390, emailReceivedAt: new Date(2026, 4, 10) }),
        ev({ amountInTwd: 390, emailReceivedAt: new Date(2026, 5, 10) }),
      ],
      6,
      NOW,
    );
    expect(points.find((p) => p.month === "2026-05")?.totalTwd).toBe(390);
    expect(points.find((p) => p.month === "2026-06")?.totalTwd).toBe(390);
  });

  it("amortizes a yearly billing across 12 months from its month", () => {
    const points = computeMonthlySpend(
      [
        ev({
          amountInTwd: 12000,
          cycle: "yearly",
          emailReceivedAt: new Date(2026, 2, 5), // 2026-03, covers 2026-03..2027-02
        }),
      ],
      6,
      NOW,
    );
    expect(points.find((p) => p.month === "2026-02")?.totalTwd).toBe(0);
    for (const m of ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]) {
      expect(points.find((p) => p.month === m)?.totalTwd).toBe(1000);
    }
  });

  it("includes coverage reaching into the window from an event before it", () => {
    // 2025-09 yearly event: covers 2025-09..2026-08 → every window month gets 1000
    const points = computeMonthlySpend(
      [
        ev({
          amountInTwd: 12000,
          cycle: "yearly",
          emailReceivedAt: new Date(2025, 8, 20),
        }),
      ],
      6,
      NOW,
    );
    for (const p of points) expect(p.totalTwd).toBe(1000);
  });

  it("amortizes a quarterly billing across 3 months", () => {
    const points = computeMonthlySpend(
      [
        ev({
          amountInTwd: 900,
          cycle: "quarterly",
          emailReceivedAt: new Date(2026, 3, 1), // 2026-04..2026-06
        }),
      ],
      6,
      NOW,
    );
    expect(points.find((p) => p.month === "2026-03")?.totalTwd).toBe(0);
    for (const m of ["2026-04", "2026-05", "2026-06"]) {
      expect(points.find((p) => p.month === m)?.totalTwd).toBe(300);
    }
    expect(points.find((p) => p.month === "2026-07")?.totalTwd).toBe(0);
  });

  it("keeps historical amounts after a price change", () => {
    // 漲價：5 月前 390、6 月起 490，各自覆蓋各自月份
    const points = computeMonthlySpend(
      [
        ev({ amountInTwd: 390, emailReceivedAt: new Date(2026, 4, 10) }),
        ev({ amountInTwd: 490, emailReceivedAt: new Date(2026, 5, 10) }),
      ],
      6,
      NOW,
    );
    expect(points.find((p) => p.month === "2026-05")?.totalTwd).toBe(390);
    expect(points.find((p) => p.month === "2026-06")?.totalTwd).toBe(490);
  });

  it("ignores non-billing signals", () => {
    const points = computeMonthlySpend(
      [
        ev({ emailSignalType: "renewal_notice" }),
        ev({ emailSignalType: "price_change" }),
        ev({ emailSignalType: "trial_reminder" }),
        ev({ emailSignalType: "cancellation" }),
        ev({ emailSignalType: "we_miss_you" }),
      ],
      6,
      NOW,
    );
    for (const p of points) expect(p.totalTwd).toBe(0);
  });

  it("ignores one-time and unknown cycles", () => {
    const points = computeMonthlySpend(
      [ev({ cycle: "one-time" }), ev({ cycle: "weekly" })],
      6,
      NOW,
    );
    for (const p of points) expect(p.totalTwd).toBe(0);
  });

  it("sums multiple services in the same month and rounds", () => {
    const points = computeMonthlySpend(
      [
        ev({ amountInTwd: 390, emailReceivedAt: new Date(2026, 6, 1) }),
        ev({
          amountInTwd: 1000,
          cycle: "yearly",
          emailReceivedAt: new Date(2026, 6, 2),
        }), // 1000/12 = 83.33…
      ],
      6,
      NOW,
    );
    expect(points.find((p) => p.month === "2026-07")?.totalTwd).toBe(473); // round(390 + 83.33)
  });
});

describe("computeMonthDelta", () => {
  it("computes delta and pct between the last two months", () => {
    const delta = computeMonthDelta([
      { month: "2026-06", totalTwd: 400 },
      { month: "2026-07", totalTwd: 500 },
    ]);
    expect(delta).toEqual({ deltaTwd: 100, pctChange: 0.25 });
  });

  it("computes a negative delta when spend decreased", () => {
    const delta = computeMonthDelta([
      { month: "2026-06", totalTwd: 500 },
      { month: "2026-07", totalTwd: 400 },
    ]);
    expect(delta).toEqual({ deltaTwd: -100, pctChange: -0.2 });
  });

  it("returns null pct when the previous month had no spend", () => {
    const delta = computeMonthDelta([
      { month: "2026-06", totalTwd: 0 },
      { month: "2026-07", totalTwd: 400 },
    ]);
    expect(delta).toEqual({ deltaTwd: 400, pctChange: null });
  });

  it("returns null when both months have no spend", () => {
    expect(
      computeMonthDelta([
        { month: "2026-06", totalTwd: 0 },
        { month: "2026-07", totalTwd: 0 },
      ]),
    ).toBeNull();
  });

  it("returns null with fewer than two points", () => {
    expect(computeMonthDelta([])).toBeNull();
    expect(computeMonthDelta([{ month: "2026-07", totalTwd: 400 }])).toBeNull();
  });
});

describe("computeServiceHistory", () => {
  function hev(overrides: Partial<ServiceHistoryEvent>): ServiceHistoryEvent {
    return {
      amount: 390,
      currency: "TWD",
      amountInTwd: 390,
      cycle: "monthly",
      emailSignalType: "billing",
      emailReceivedAt: new Date(2026, 5, 10),
      ...overrides,
    };
  }

  it("returns empty history for no events", () => {
    expect(computeServiceHistory([])).toEqual({ points: [], priceChanges: [] });
  });

  it("keeps only amount-bearing signal types", () => {
    const { points } = computeServiceHistory([
      hev({ emailSignalType: "billing" }),
      hev({ emailSignalType: "we_miss_you" }),
      hev({ emailSignalType: "trial_reminder" }),
      hev({ emailSignalType: "cancellation" }),
      hev({ emailSignalType: "price_change" }),
      hev({ emailSignalType: "renewal_notice" }),
    ]);
    expect(points.map((p) => p.emailSignalType)).toEqual([
      "billing",
      "price_change",
      "renewal_notice",
    ]);
  });

  it("sorts points ascending and formats dates as ISO strings", () => {
    const { points } = computeServiceHistory([
      hev({ emailReceivedAt: new Date(2026, 5, 10), amountInTwd: 390 }),
      hev({ emailReceivedAt: new Date(2026, 3, 10), amountInTwd: 330 }),
    ]);
    expect(points.map((p) => p.date)).toEqual(["2026-04-10", "2026-06-10"]);
    expect(points[0].amountInTwd).toBe(330);
  });

  it("detects a price increase between consecutive same-cycle events", () => {
    const { priceChanges } = computeServiceHistory([
      hev({ emailReceivedAt: new Date(2026, 3, 10), amountInTwd: 330, amount: 330 }),
      hev({ emailReceivedAt: new Date(2026, 4, 10), amountInTwd: 330, amount: 330 }),
      hev({ emailReceivedAt: new Date(2026, 5, 10), amountInTwd: 390, amount: 390 }),
    ]);
    expect(priceChanges).toEqual([
      { date: "2026-06-10", fromTwd: 330, toTwd: 390, pctChange: 0.182 },
    ]);
  });

  it("reports a price decrease with negative pct", () => {
    const { priceChanges } = computeServiceHistory([
      hev({ emailReceivedAt: new Date(2026, 3, 10), amountInTwd: 500 }),
      hev({ emailReceivedAt: new Date(2026, 4, 10), amountInTwd: 400 }),
    ]);
    expect(priceChanges).toEqual([
      { date: "2026-05-10", fromTwd: 500, toTwd: 400, pctChange: -0.2 },
    ]);
  });

  it("does not flag equal consecutive amounts", () => {
    const { priceChanges } = computeServiceHistory([
      hev({ emailReceivedAt: new Date(2026, 3, 10) }),
      hev({ emailReceivedAt: new Date(2026, 4, 10) }),
    ]);
    expect(priceChanges).toEqual([]);
  });

  it("treats a cycle switch as a plan change, not a price change", () => {
    const { priceChanges } = computeServiceHistory([
      hev({ emailReceivedAt: new Date(2026, 3, 10), cycle: "monthly", amountInTwd: 390 }),
      hev({ emailReceivedAt: new Date(2026, 4, 10), cycle: "yearly", amountInTwd: 3990 }),
    ]);
    expect(priceChanges).toEqual([]);
  });
});
