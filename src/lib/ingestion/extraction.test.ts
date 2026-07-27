import { describe, it, expect, vi } from "vitest";
import { MockLanguageModelV2 } from "ai/test";
import { ExtractionSchema, llmExtract } from "./extraction";
import type { SubscriptionEmail } from "@/lib/ingestion/gmail";

describe("ExtractionSchema", () => {
  const base = {
    isSubscriptionRelated: true,
    rawServiceName: "Cursor",
    currency: "USD" as const,
    cycle: "monthly" as const,
    category: "ai" as const,
    emailSignalType: "billing" as const,
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

const email: SubscriptionEmail = {
  id: "msg-1",
  from: "noreply@cursor.com",
  subject: "Receipt from Cursor",
  date: "Mon, 12 May 2026 09:00:00 +0000",
  snippet: "Thank you for your payment",
  body: "Thank you for your payment of $20.00 USD for Cursor Pro.",
};

function modelReturning(obj: unknown) {
  return new MockLanguageModelV2({
    doGenerate: async () => ({
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      content: [{ type: "text", text: JSON.stringify(obj) }],
      warnings: [],
    }),
  });
}

function modelThrowing() {
  return new MockLanguageModelV2({
    doGenerate: async () => {
      throw new Error("network down");
    },
  });
}

describe("llmExtract", () => {
  it("returns the parsed object on a valid subscription extraction", async () => {
    const model = modelReturning({
      isSubscriptionRelated: true,
      rawServiceName: "Cursor Pro",
      amount: 20,
      currency: "USD",
      cycle: "monthly",
      category: "ai",
      emailSignalType: "billing",
      });
    const result = await llmExtract(email, model);
    expect(result).not.toBeNull();
    expect(result!.rawServiceName).toBe("Cursor Pro");
    expect(result!.amount).toBe(20);
  });

  it("returns null and logs when the model output fails schema validation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // amount as a string violates z.number()
    const model = modelReturning({
      isSubscriptionRelated: true,
      rawServiceName: "Cursor",
      amount: "twenty",
      currency: "USD",
      cycle: "monthly",
      category: "ai",
      emailSignalType: "billing",
    });
    const result = await llmExtract(email, model);
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns null and logs when the model call throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await llmExtract(email, modelThrowing());
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
