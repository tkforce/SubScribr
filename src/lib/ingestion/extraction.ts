import { z } from "zod";
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import type { SubscriptionEmail } from "@/lib/ingestion/gmail";
import { getModel } from "@/lib/llm";

export const ExtractionSchema = z.object({
  isSubscriptionRelated: z.boolean(),
  notSubscriptionReason: z
    .enum(["one_time_purchase", "promotional", "service_unrelated", "unclear"])
    .optional(),
  rawServiceName: z.string().optional(),
  amount: z.number().positive().optional(),
  currency: z.enum(["TWD", "USD", "JPY", "EUR"]).optional(),
  cycle: z.enum(["monthly", "yearly", "quarterly", "one-time"]).optional(),
  nextBillingDate: z.iso.date().optional(),
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
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export const PROMPT_VERSION = "v6-english-instructions-temp0";

// Instructions are in English; the examples are not translated.
//
// Everything the model has to *recognise* stays in the language it arrives in.
// The example subjects below are real zh-TW subject lines from the fixture set,
// and the currency section lists the literal markers that appear in Taiwanese
// receipts (NT$ / 新台幣 / 元). Translating those would delete the only signal
// they carry. What became English is the part addressed to the model — rules,
// reasoning, field descriptions — because that is where instruction-following
// quality lives, and because it no longer has to match the UI language.
//
// Note what is *not* affected by this: every output field is an enum, a number,
// or rawServiceName copied verbatim from the email. So a zh-TW receipt still
// produces the same BillingEvent it always did, and a service whose brand name
// is Chinese keeps its Chinese name — that is a proper noun, not a translation
// failure.
export const SYSTEM_PROMPT = `You analyse subscription emails. Extract subscription facts from the email and respond with the JSON schema below.

Deciding isSubscriptionRelated:
- It IS a subscription: recurring charges, monthly/annual fees, membership
  renewals, trial-ending reminders, subscription cancellation notices.
  Recurring telecom line charges (a mobile plan's monthly fee) count too.
- It is NOT a subscription (false):
  - One-off purchases (food delivery orders, e-commerce invoices, restaurant
    bills) → one_time_purchase
  - Prepaid credit / stored-value / ticket purchases (gym credit packs,
    pay-per-minute cards): even when the email states a "plan duration" or an
    expiry ("valid for one year"), that is how long the credit lasts, not a
    recurring billing cycle → one_time_purchase
  - Marketing mail, coupons, promotions → promotional
  - Credit card or bank statements: an aggregate of many purchases, not one
    service's subscription fee → service_unrelated
  - Recurring investment debits (brokerage, funds, scheduled stock purchases):
    recurring, but investing is not a service subscription → service_unrelated
  - Billing administrivia (invoice address changed, statement format changed)
    with no actual charge in the email → service_unrelated
  - E-invoice issuance notices, password resets, sign-in alerts →
    service_unrelated
  - Genuinely ambiguous → unclear

Field rules:
- amount: digits only, no currency symbol. When several amounts appear, take
  the total actually charged. Only count a number that the email itself marks
  as an amount (adjacent to a currency symbol, or next to wording like
  charged / paid / total / 已收取 / 已扣款 / 總計 / 金額). If no such number
  exists, leave amount — and currency and cycle — empty even when
  isSubscriptionRelated is true. Never fall back on what you happen to know
  about the service's pricing: an empty field beats an invented one.
- currency: read the email's own evidence rather than defaulting to TWD, in
  this order:
  1. An explicit marker wins: NT$ / 新台幣 / 元 → TWD; US$ / USD → USD;
     ¥ / 円 / JPY → JPY; € / EUR → EUR
  2. For a bare "$" with nothing else, use the service and sender: a foreign
     service's own receipt or a Stripe receipt (anthropic.com, openai.com) →
     USD; an Apple / Google / local telecom bill that also shows NT$ → TWD
  3. Only if still undecidable, let the magnitude hint (a $20 monthly fee is
     usually USD, $690 is usually TWD)
- rawServiceName: the brand name, not the legal entity ("Netflix", not
  "Netflix International B.V."). Copy it as written — do not translate it.
- emailSignalType:
  - billing: charge confirmation / receipt
  - renewal_notice: upcoming renewal, not charged yet
  - trial_reminder: a trial is about to end
  - price_change: price increase or decrease announcement
  - cancellation: cancellation confirmed
  - we_miss_you: win-back promotion for a subscription already stopped
- nextBillingDate: ISO format (YYYY-MM-DD)

When isSubscriptionRelated=false, fill in notSubscriptionReason only and omit
every other field.

Examples — none of these is a subscription:

Example 1:
Subject: 信用卡帳單繳款通知
Why: a credit card statement aggregates many purchases and the total moves
every month; it is not one service's subscription fee
→ isSubscriptionRelated: false, notSubscriptionReason: service_unrelated

Example 2:
Subject: 台股定期定額買股預先圈存(或預收)款項通知書
Why: a scheduled investment debit — recurring, but investing, not a service
→ isSubscriptionRelated: false, notSubscriptionReason: service_unrelated

Example 3:
Subject: Important – AWS Invoice e-mail address changes
Why: billing administrivia (a settings change); no charge occurs in the email
→ isSubscriptionRelated: false, notSubscriptionReason: service_unrelated

Example 4:
Subject: 購買成功通知 | More Fit
Why: buying gym credit (a pay-per-minute pack). "方案時長 1年" is how long the
credit stays valid, not a billing cycle; a one-off purchase is not a
subscription even in an industry full of subscriptions
→ isSubscriptionRelated: false, notSubscriptionReason: one_time_purchase

Currency examples:

Example 5:
From: invoice+statements@mail.anthropic.com, body "Claude Pro $20.00 Paid"
Why: a US service billing through Stripe — a bare "$" is USD, not TWD
→ currency: USD

Example 6:
From: Apple, body contains both "NT$ 690" and "$690/月"
Why: an explicit NT$ marker is present, so the explicit marker wins
→ currency: TWD

Amount example:

Example 7:
Subject: Your Pro subscription is confirmed
Body: "Thanks for starting your Pro subscription. Your payment method has
been charged. The next charge will be on Aug 17, 2026."
Why: this is a subscription confirmation, so isSubscriptionRelated is true,
but nowhere does the email mark a number as an amount — do not fill it in
from what a "Pro plan" usually costs
→ isSubscriptionRelated: true, emailSignalType: billing, amount empty`;

export function formatUserPrompt(email: SubscriptionEmail): string {
  return `From: ${email.from}
Subject: ${email.subject}
Body:
${email.body}`;
}

function logExtractionFailure(gmailMessageId: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "Unknown";
  const message = err instanceof Error ? err.message : String(err);
  const kind =
    name.includes("Validation") || name.includes("NoObject")
      ? "schema_fail"
      : "api_error";
  console.warn(
    `[extraction:${kind}] gmailMessageId=${gmailMessageId} ${message}`,
  );
}

// Returns the parsed extraction, or null on any failure (skip + log, no retry).
// The caller decides what to do with isSubscriptionRelated=false.
export async function llmExtract(
  email: SubscriptionEmail,
  model: LanguageModel = getModel(),
): Promise<Extraction | null> {
  try {
    const { object } = await generateObject({
      model,
      schema: ExtractionSchema,
      system: SYSTEM_PROMPT,
      prompt: formatUserPrompt(email),
      // Extraction wants reproducibility, not creativity: same email → same
      // output, so eval scores are stable and currency doesn't flap run-to-run.
      temperature: 0,
    });
    return object;
  } catch (err) {
    logExtractionFailure(email.id, err);
    return null;
  }
}
