import { describe, it, expect } from "vitest";
import { ExtractionSchema } from "./extraction";

describe("ExtractionSchema", () => {
  const base = {
    isSubscriptionRelated: true,
    rawServiceName: "Cursor",
    currency: "USD" as const,
    cycle: "monthly" as const,
    category: "ai" as const,
    emailSignalType: "billing" as const,
    isTrial: false,
  };

  it("rejects amount of zero", () => {
    const r = ExtractionSchema.safeParse({ ...base, amount: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const r = ExtractionSchema.safeParse({ ...base, amount: -5 });
    expect(r.success).toBe(false);
  });

  it("accepts a positive amount", () => {
    const r = ExtractionSchema.safeParse({ ...base, amount: 20 });
    expect(r.success).toBe(true);
  });

  it("rejects a non-ISO nextBillingDate", () => {
    const r = ExtractionSchema.safeParse({
      ...base,
      amount: 20,
      nextBillingDate: "2026/06/15",
    });
    expect(r.success).toBe(false);
  });

  it("accepts an ISO nextBillingDate", () => {
    const r = ExtractionSchema.safeParse({
      ...base,
      amount: 20,
      nextBillingDate: "2026-06-15",
    });
    expect(r.success).toBe(true);
  });
});
