import { describe, it, expect } from "vitest";
import {
  monthlyAmountTwd,
  computeOverview,
  upcomingBilling,
  projectNextBilling,
} from "./subscriptions";

describe("monthlyAmountTwd", () => {
  it("monthly returns amount as-is", () => {
    expect(monthlyAmountTwd({ cycle: "monthly", amountInTwd: 390 })).toBe(390);
  });
  it("yearly divides by 12", () => {
    expect(monthlyAmountTwd({ cycle: "yearly", amountInTwd: 1200 })).toBe(100);
  });
  it("quarterly divides by 3", () => {
    expect(monthlyAmountTwd({ cycle: "quarterly", amountInTwd: 300 })).toBe(100);
  });
  it("one-time is excluded (0)", () => {
    expect(monthlyAmountTwd({ cycle: "one-time", amountInTwd: 5000 })).toBe(0);
  });
  it("unknown cycle is 0", () => {
    expect(monthlyAmountTwd({ cycle: "weekly", amountInTwd: 100 })).toBe(0);
  });
});

describe("computeOverview", () => {
  it("empty list", () => {
    expect(computeOverview([])).toEqual({ totalMonthlyTwd: 0, activeCount: 0 });
  });
  it("sums monthly-normalized amounts and excludes one-time", () => {
    const subs = [
      { cycle: "monthly", amountInTwd: 390 },
      { cycle: "yearly", amountInTwd: 1200 }, // 100
      { cycle: "one-time", amountInTwd: 5000 }, // 0
    ];
    expect(computeOverview(subs)).toEqual({ totalMonthlyTwd: 490, activeCount: 3 });
  });
  it("rounds the total", () => {
    const subs = [{ cycle: "yearly", amountInTwd: 1000 }]; // 83.33
    expect(computeOverview(subs)).toEqual({ totalMonthlyTwd: 83, activeCount: 1 });
  });
});

describe("upcomingBilling", () => {
  const NOW = new Date(2026, 6, 11, 14, 30); // 2026-07-11 14:30

  it("returns 今天 for a billing later the same day", () => {
    expect(upcomingBilling(new Date(2026, 6, 11, 23, 0), NOW)).toEqual({
      days: 0,
      label: "今天扣款",
    });
  });

  it("returns 明天 even when less than 24h away across midnight", () => {
    expect(upcomingBilling(new Date(2026, 6, 12, 1, 0), NOW)).toEqual({
      days: 1,
      label: "明天扣款",
    });
  });

  it("returns N 天後 up to 7 days out", () => {
    expect(upcomingBilling(new Date(2026, 6, 15), NOW)).toEqual({
      days: 4,
      label: "4 天後扣款",
    });
    expect(upcomingBilling(new Date(2026, 6, 18), NOW)).toEqual({
      days: 7,
      label: "7 天後扣款",
    });
  });

  it("returns null beyond 7 days", () => {
    expect(upcomingBilling(new Date(2026, 6, 19), NOW)).toBeNull();
  });

  it("returns null for past dates (stale data, not a warning)", () => {
    expect(upcomingBilling(new Date(2026, 6, 10), NOW)).toBeNull();
  });

  it("returns null when there is no next billing date", () => {
    expect(upcomingBilling(null, NOW)).toBeNull();
  });
});

describe("projectNextBilling", () => {
  const NOW = new Date(2026, 6, 27); // 2026-07-27

  it("rolls a monthly cycle forward to the first future date", () => {
    // last bill 2026-06-15 → 07-15 already passed → 08-15
    expect(projectNextBilling(new Date(2026, 5, 15), "monthly", NOW)).toEqual(
      new Date(2026, 7, 15),
    );
  });

  it("returns next month when the last bill arrived today", () => {
    // A bill that landed today already charged today; the next one is a cycle out.
    expect(projectNextBilling(new Date(2026, 6, 27), "monthly", NOW)).toEqual(
      new Date(2026, 7, 27),
    );
  });

  it("handles quarterly and yearly cycles", () => {
    expect(projectNextBilling(new Date(2026, 4, 10), "quarterly", NOW)).toEqual(
      new Date(2026, 7, 10),
    );
    expect(projectNextBilling(new Date(2026, 1, 3), "yearly", NOW)).toEqual(
      new Date(2027, 1, 3),
    );
  });

  it("rolls a long-stale anchor all the way into the future", () => {
    // Two years of monthly bills missing — still lands on the next real date.
    expect(projectNextBilling(new Date(2024, 2, 5), "monthly", NOW)).toEqual(
      new Date(2026, 7, 5),
    );
  });

  it("clamps to the last day of a shorter month", () => {
    // 01-31 + 1 month is not 03-03: February has no 31st.
    expect(
      projectNextBilling(new Date(2026, 0, 31), "monthly", new Date(2026, 1, 1)),
    ).toEqual(new Date(2026, 1, 28));
  });

  it("does not drift after passing through a clamped month", () => {
    // Anchored on the original day, so March returns to the 31st.
    expect(
      projectNextBilling(new Date(2026, 0, 31), "monthly", new Date(2026, 2, 1)),
    ).toEqual(new Date(2026, 2, 31));
  });

  it("returns null for one-time and unknown cycles (not recurring)", () => {
    expect(projectNextBilling(new Date(2026, 5, 15), "one-time", NOW)).toBeNull();
    expect(projectNextBilling(new Date(2026, 5, 15), "weekly", NOW)).toBeNull();
  });
});
