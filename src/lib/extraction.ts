import { z } from "zod";
import type { SubscriptionEmail } from "@/lib/gmail";

export const ExtractionSchema = z.object({
  isSubscriptionRelated: z.boolean(),
  notSubscriptionReason: z
    .enum(["one_time_purchase", "promotional", "service_unrelated", "unclear"])
    .optional(),
  rawServiceName: z.string().optional(),
  amount: z.number().optional(),
  currency: z.enum(["TWD", "USD", "JPY", "EUR"]).optional(),
  cycle: z.enum(["monthly", "yearly", "quarterly", "one-time"]).optional(),
  nextBillingDate: z.string().optional(),
  category: z
    .enum(["entertainment", "productivity", "ai", "cloud", "comm", "other"])
    .optional(),
  emailSignalType: z
    .enum([
      "billing",
      "trial_reminder",
      "we_miss_you",
      "price_change",
      "renewal_notice",
      "cancellation",
    ])
    .optional(),
  isTrial: z.boolean().optional(),
  trialEndsAt: z.string().optional(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export const PROMPT_VERSION = "v0-dummy";

// Week 3 replaces this with a real LLM call. Stays here so the pipeline shape
// (and BillingEvent insert payload) is fully exercised before the LLM lands.
export function extractDummy(email: SubscriptionEmail): Extraction {
  return {
    isSubscriptionRelated: true,
    rawServiceName: email.from,
    amount: 0,
    currency: "TWD",
    cycle: "monthly",
    category: "other",
    emailSignalType: "billing",
    isTrial: false,
  };
}
