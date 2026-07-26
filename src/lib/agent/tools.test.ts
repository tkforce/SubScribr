import { describe, expect, it } from "vitest";
import {
  buildAgentTools,
  buildSubscriptionWhere,
  getServiceInfoForAgent,
  shapeSubscriptionForAgent,
} from "./tools";

describe("buildSubscriptionWhere", () => {
  it("defaults to active subscriptions for the bound user", () => {
    expect(buildSubscriptionWhere("u1", {})).toEqual({
      userId: "u1",
      status: "active",
    });
  });

  it('status "all" drops the status filter but keeps the user scope', () => {
    expect(buildSubscriptionWhere("u1", { status: "all" })).toEqual({
      userId: "u1",
    });
  });

  it("passes through explicit status and category", () => {
    expect(
      buildSubscriptionWhere("u1", { status: "cancelled", category: "ai" }),
    ).toEqual({ userId: "u1", status: "cancelled", category: "ai" });
  });

  it("normalizes a raw service name to its canonical id", () => {
    expect(buildSubscriptionWhere("u1", { serviceName: "Netflix" })).toEqual({
      userId: "u1",
      status: "active",
      serviceName: "netflix",
    });
  });

  it("keeps an already-canonical id unchanged", () => {
    expect(
      buildSubscriptionWhere("u1", { serviceName: "youtube_premium" }),
    ).toEqual({ userId: "u1", status: "active", serviceName: "youtube_premium" });
  });
});

describe("shapeSubscriptionForAgent", () => {
  const row = {
    serviceName: "netflix",
    displayName: null,
    amount: 460,
    currency: "TWD",
    amountInTwd: 460,
    cycle: "monthly",
    category: "entertainment",
    status: "active",
    nextBillingDate: new Date("2026-08-01T00:00:00Z"),
    isTrial: false,
    trialEndsAt: null,
    lastSeenAt: new Date("2026-07-15T10:00:00Z"),
  };

  it("converts dates to ISO date strings and computes monthly TWD", () => {
    const shaped = shapeSubscriptionForAgent(row);
    expect(shaped).toEqual({
      serviceName: "netflix",
      displayName: null,
      amount: 460,
      currency: "TWD",
      amountInTwd: 460,
      monthlyAmountTwd: 460,
      cycle: "monthly",
      category: "entertainment",
      status: "active",
      nextBillingDate: "2026-08-01",
      isTrial: false,
      trialEndsAt: null,
      lastSeenAt: "2026-07-15",
    });
  });

  it("normalizes yearly amounts into the monthly figure", () => {
    const shaped = shapeSubscriptionForAgent({
      ...row,
      cycle: "yearly",
      amountInTwd: 2790,
    });
    expect(shaped.monthlyAmountTwd).toBe(233); // 2790 / 12, rounded
  });

  it("handles null dates", () => {
    const shaped = shapeSubscriptionForAgent({ ...row, nextBillingDate: null });
    expect(shaped.nextBillingDate).toBeNull();
  });
});

describe("getServiceInfoForAgent", () => {
  it("returns knowledge for a canonical id", () => {
    const out = getServiceInfoForAgent("netflix");
    expect(out.found).toBe(true);
    expect(out.found && out.displayName).toBe("Netflix");
  });

  it("resolves raw names via normalization", () => {
    const out = getServiceInfoForAgent("Netflix");
    expect(out.found && out.id).toBe("netflix");
  });

  it("reports found: false for unknown services instead of throwing", () => {
    const out = getServiceInfoForAgent("某個不存在的服務");
    expect(out.found).toBe(false);
  });
});

describe("buildAgentTools", () => {
  it("exposes the four F7 tools, each with an execute", () => {
    const tools = buildAgentTools("u1");
    expect(Object.keys(tools).sort()).toEqual([
      "calculate_trend",
      "detect_anomalies",
      "get_service_info",
      "query_subscriptions",
    ]);
    expect(typeof tools.get_service_info.execute).toBe("function");
    expect(typeof tools.query_subscriptions.execute).toBe("function");
    expect(typeof tools.calculate_trend.execute).toBe("function");
    expect(typeof tools.detect_anomalies.execute).toBe("function");
  });
});
