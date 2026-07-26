import { describe, it, expect } from "vitest";
import { MockLanguageModelV2 } from "ai/test";
import { processEmail } from "./pipeline";
import type { SubscriptionEmail } from "@/lib/ingestion/gmail";

const email: SubscriptionEmail = {
  id: "msg-1",
  from: "noreply@cursor.com",
  subject: "Receipt from Cursor",
  date: "Mon, 12 May 2026 09:00:00 +0000",
  snippet: "payment",
  body: "Thank you for your payment of $20.00 USD for Cursor.",
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

describe("processEmail", () => {
  it("builds a BillingEventInsert with a normalized canonical id", async () => {
    const model = modelReturning({
      isSubscriptionRelated: true,
      rawServiceName: "Cursor",
      amount: 20,
      currency: "USD",
      cycle: "monthly",
      category: "ai",
      emailSignalType: "billing",
      isTrial: false,
    });
    const out = await processEmail(email, "user-1", model);
    expect(out.kind).toBe("inserted");
    if (out.kind !== "inserted") return;
    expect(out.row.serviceName).toBe("cursor"); // slugify fallback, aliases empty
    expect(out.row.rawServiceName).toBe("Cursor");
    expect(out.row.amountInTwd).toBeCloseTo(20 * 31.5, 2);
    expect(out.row.gmailMessageId).toBe("msg-1");
    expect(out.row.category).toBe("ai");
  });

  it("carries category=null when the LLM omits it", async () => {
    const model = modelReturning({
      isSubscriptionRelated: true,
      rawServiceName: "Cursor",
      amount: 20,
      currency: "USD",
      cycle: "monthly",
      emailSignalType: "billing",
    });
    const out = await processEmail(email, "user-1", model);
    expect(out.kind).toBe("inserted");
    if (out.kind !== "inserted") return;
    expect(out.row.category).toBeNull();
  });

  it("returns null when isSubscriptionRelated is false", async () => {
    const model = modelReturning({
      isSubscriptionRelated: false,
      notSubscriptionReason: "one_time_purchase",
    });
    const out = await processEmail(email, "user-1", model);
    expect(out.kind).toBe("not_subscription");
  });

  it("returns blacklisted for a blacklisted email without calling the model", async () => {
    const blacklisted: SubscriptionEmail = {
      ...email,
      subject: "Please verify your email",
    };
    const throwing = new MockLanguageModelV2({
      doGenerate: async () => {
        throw new Error("model should not be called");
      },
    });
    const out = await processEmail(blacklisted, "user-1", throwing);
    expect(out.kind).toBe("blacklisted");
  });
});
