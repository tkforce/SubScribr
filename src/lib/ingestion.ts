import pMap from "p-map";
import { db } from "@/lib/db";
import {
  buildSubscriptionQuery,
  fetchMessagesByIds,
  listMessageIds,
  type SubscriptionEmail,
} from "@/lib/gmail";
import { isBlacklisted } from "@/lib/blacklist";
import { PROMPT_VERSION, llmExtract } from "@/lib/extraction";
import { getModel } from "@/lib/llm";
import type { LanguageModel } from "ai";
import { normalizeServiceName } from "@/lib/service-normalization";
import { convertToTwd } from "@/lib/fx";
import { upsertSubscriptionsForServices } from "@/lib/subscription-derive";

export type IngestStats = {
  candidateCount: number;
  blacklistedCount: number;
  ingestedCount: number;
  skippedExistingCount: number;
  subscriptionsUpserted: number;
};

type BillingEventInsert = {
  userId: string;
  gmailMessageId: string;
  emailReceivedAt: Date;
  rawServiceName: string;
  serviceName: string;
  amount: number;
  currency: string;
  amountInTwd: number;
  cycle: string;
  emailSignalType: string;
  promptVersion: string;
};

export async function processEmail(
  email: SubscriptionEmail,
  userId: string,
  model: LanguageModel = getModel(),
): Promise<BillingEventInsert | null> {
  if (isBlacklisted(email)) return null;

  const extraction = await llmExtract(email, model);
  if (extraction === null) return null;

  if (!extraction.isSubscriptionRelated) {
    console.info(
      `[extraction:not_subscription] gmailMessageId=${email.id} reason=${extraction.notSubscriptionReason ?? "unspecified"} subject=${email.subject}`,
    );
    return null;
  }

  const { rawServiceName, amount, currency, cycle, emailSignalType } =
    extraction;
  if (
    rawServiceName === undefined ||
    amount === undefined ||
    currency === undefined ||
    cycle === undefined ||
    emailSignalType === undefined
  ) {
    console.warn(`[extraction:missing_fields] gmailMessageId=${email.id}`);
    return null;
  }

  const { canonicalId } = normalizeServiceName(rawServiceName);

  return {
    userId,
    gmailMessageId: email.id,
    emailReceivedAt: parseEmailDate(email.date),
    rawServiceName,
    serviceName: canonicalId,
    amount,
    currency,
    amountInTwd: convertToTwd(amount, currency),
    cycle,
    emailSignalType,
    promptVersion: PROMPT_VERSION,
  };
}

export async function ingestEmails(
  accessToken: string,
  userId: string,
): Promise<IngestStats> {
  const query = buildSubscriptionQuery(90);
  const allIds = await listMessageIds(accessToken, query);
  const candidateCount = allIds.length;

  const existing = await db.billingEvent.findMany({
    where: { userId, gmailMessageId: { in: allIds } },
    select: { gmailMessageId: true },
  });
  const existingIds = new Set(existing.map((e) => e.gmailMessageId));
  const newIds = allIds.filter((id) => !existingIds.has(id));
  const skippedExistingCount = candidateCount - newIds.length;

  const emails = await fetchMessagesByIds(accessToken, newIds);

  const results = await pMap(
    emails,
    (email) => processEmail(email, userId),
    { concurrency: 10, stopOnError: false },
  );
  const inserts = results.filter(
    (r): r is BillingEventInsert => r !== null,
  );
  // Everything fetched but not turned into an insert: blacklisted, not a
  // subscription, missing fields, or an extraction failure.
  const blacklistedCount = emails.length - inserts.length;

  let ingestedCount = 0;
  if (inserts.length > 0) {
    const result = await db.billingEvent.createMany({
      data: inserts,
      skipDuplicates: true,
    });
    ingestedCount = result.count;
  }

  // only upsert subscriptions for services that had new billing events to avoid unnecessary upserts
  const affected = new Set(inserts.map((i) => i.serviceName));
  const subscriptionsUpserted = await upsertSubscriptionsForServices(
    userId,
    affected,
  );

  return {
    candidateCount,
    blacklistedCount,
    ingestedCount,
    skippedExistingCount,
    subscriptionsUpserted,
  };
}

function parseEmailDate(rfc2822: string): Date {
  const d = new Date(rfc2822);
  return isNaN(d.getTime()) ? new Date() : d;
}
