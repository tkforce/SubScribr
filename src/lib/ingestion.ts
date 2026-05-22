import { db } from "@/lib/db";
import {
  buildSubscriptionQuery,
  fetchMessagesByIds,
  listMessageIds,
  type SubscriptionEmail,
} from "@/lib/gmail";
import { isBlacklisted } from "@/lib/blacklist";
import {
  ExtractionSchema,
  PROMPT_VERSION,
  extractDummy,
  type Extraction,
} from "@/lib/extraction";
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

export function processEmail(
  email: SubscriptionEmail,
  userId: string,
): BillingEventInsert | null {
  if (isBlacklisted(email)) return null;

  const extraction: Extraction = ExtractionSchema.parse(extractDummy(email));
  if (!extraction.isSubscriptionRelated) return null;

  const { rawServiceName, amount, currency, cycle, emailSignalType } =
    extraction;
  if (
    rawServiceName === undefined ||
    amount === undefined ||
    currency === undefined ||
    cycle === undefined ||
    emailSignalType === undefined
  ) {
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

  const inserts: BillingEventInsert[] = [];
  let blacklistedCount = 0;
  for (const email of emails) {
    const row = processEmail(email, userId);
    if (row === null) {
      blacklistedCount += 1;
      continue;
    }
    inserts.push(row);
  }

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
