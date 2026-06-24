import { describe, it, expect } from "vitest";
import { monthlyAmountTwd, computeOverview } from "./subscriptions";

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
