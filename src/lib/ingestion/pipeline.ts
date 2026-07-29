import pMap from "p-map";
import { db } from "@/lib/db";
import {
  buildSubscriptionQuery,
  fetchMessagesByIds,
  listMessageIds,
  type SubscriptionEmail,
} from "@/lib/ingestion/gmail";
import { isBlacklisted } from "@/lib/ingestion/blacklist";
import { PROMPT_VERSION, llmExtract } from "@/lib/ingestion/extraction";
import { getModel } from "@/lib/llm";
import type { LanguageModel } from "ai";
import { normalizeServiceName } from "@/lib/services/normalization";
import { convertToTwd } from "@/lib/fx";
import { upsertSubscriptionsForServices } from "@/lib/ingestion/derive";

export type IngestStats = {
  candidateCount: number;
  skippedExistingCount: number;
  blacklistedCount: number;
  notSubscriptionCount: number;
  missingFieldsCount: number;
  extractFailedCount: number;
  ingestedCount: number;
  subscriptionsUpserted: number;
};

// Why each fetched email did or didn't become a BillingEvent. Lets ingestEmails
// report a real breakdown instead of lumping every non-insert into "blacklisted".
export type ProcessOutcome =
  | { kind: "inserted"; row: BillingEventInsert }
  | { kind: "blacklisted" }
  | { kind: "not_subscription" }
  | { kind: "missing_fields" }
  | { kind: "extract_failed" };

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
  category: string | null;
  emailSignalType: string;
  promptVersion: string;
};

export async function processEmail(
  email: SubscriptionEmail,
  userId: string,
  model: LanguageModel = getModel(),
): Promise<ProcessOutcome> {
  if (isBlacklisted(email)) return { kind: "blacklisted" };

  const extraction = await llmExtract(email, model);
  if (extraction === null) return { kind: "extract_failed" };

  if (!extraction.isSubscriptionRelated) {
    console.info(
      `[extraction:not_subscription] gmailMessageId=${email.id} reason=${extraction.notSubscriptionReason ?? "unspecified"} subject=${email.subject}`,
    );
    return { kind: "not_subscription" };
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
    return { kind: "missing_fields" };
  }

  const { canonicalId } = normalizeServiceName(rawServiceName);

  return {
    kind: "inserted",
    row: {
      userId,
      gmailMessageId: email.id,
      emailReceivedAt: parseEmailDate(email.date),
      rawServiceName,
      serviceName: canonicalId,
      amount,
      currency,
      amountInTwd: convertToTwd(amount, currency),
      cycle,
      category: extraction.category ?? null,
      emailSignalType,
      promptVersion: PROMPT_VERSION,
    },
  };
}

// Reports what the pipeline is doing, one line at a time. Plain strings rather
// than an event union: the pipeline composes the copy, and the SSE route wraps
// it — that keeps this module unaware of any transport.
export type ProgressHandler = (message: string) => void;

export async function ingestEmails(
  accessToken: string,
  userId: string,
  days: number,
  onProgress?: ProgressHandler,
): Promise<IngestStats> {
  const report = onProgress ?? (() => {});

  report("連線 Gmail⋯");

  const query = buildSubscriptionQuery(days);
  const allIds = await listMessageIds(accessToken, query);
  const candidateCount = allIds.length;

  report(`Gmail 篩選⋯找到 ${candidateCount} 封候選信件`);

  const existing = await db.billingEvent.findMany({
    where: { userId, gmailMessageId: { in: allIds } },
    select: { gmailMessageId: true },
  });
  const existingIds = new Set(existing.map((e) => e.gmailMessageId));
  const newIds = allIds.filter((id) => !existingIds.has(id));
  const skippedExistingCount = candidateCount - newIds.length;

  if (newIds.length > 0) report(`讀取信件內容⋯${newIds.length} 封`);

  const emails = await fetchMessagesByIds(accessToken, newIds);

  // Counts completions, not starts: at concurrency 20 the starts all fire at
  // once and would jump the counter straight to the total.
  let examined = 0;
  const results = await pMap(
    emails,
    async (email) => {
      const outcome = await processEmail(email, userId);
      examined += 1;
      report(`AI 判讀中⋯${examined} / ${emails.length}`);
      return outcome;
    },
    {
      // Paid Tier 1 Gemini has plenty of RPM (~2k); the real ceiling is TPM
      // (~4M) since each email is token-heavy (~3k tokens). concurrency × (60 /
      // latency) × tokensPerCall must stay under TPM. 15-20 finishes our volume
      // in seconds with comfortable headroom; the SDK's backoff absorbs bursts.
      concurrency: 20,
      stopOnError: false,
    },
  );

  const inserts: BillingEventInsert[] = [];
  let blacklistedCount = 0;
  let notSubscriptionCount = 0;
  let missingFieldsCount = 0;
  let extractFailedCount = 0;
  for (const r of results) {
    switch (r.kind) {
      case "inserted":
        inserts.push(r.row);
        break;
      case "blacklisted":
        blacklistedCount += 1;
        break;
      case "not_subscription":
        notSubscriptionCount += 1;
        break;
      case "missing_fields":
        missingFieldsCount += 1;
        break;
      case "extract_failed":
        extractFailedCount += 1;
        break;
    }
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
  if (affected.size > 0) report(`整理訂閱資料⋯${affected.size} 個服務`);
  const subscriptionsUpserted = await upsertSubscriptionsForServices(
    userId,
    affected,
  );

  // Sync watermark, not a data watermark: stamped even when nothing new was
  // found, so the dashboard's staleness check reflects the last attempt.
  await db.user.update({
    where: { id: userId },
    data: { lastIngestAt: new Date() },
  });

  return {
    candidateCount,
    skippedExistingCount,
    blacklistedCount,
    notSubscriptionCount,
    missingFieldsCount,
    extractFailedCount,
    ingestedCount,
    subscriptionsUpserted,
  };
}

function parseEmailDate(rfc2822: string): Date {
  const d = new Date(rfc2822);
  return isNaN(d.getTime()) ? new Date() : d;
}
