import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { computeOverview, monthlyAmountTwd } from "@/lib/subscriptions";
import { SERVICE_REGISTRY, normalizeServiceName } from "@/lib/service-normalization";
import { getServiceKnowledge } from "@/lib/service-knowledge";

// Agent tools (F7). userId is bound via closure in buildAgentTools and is
// deliberately NOT part of any inputSchema: the LLM must never control the
// tenant boundary, or a prompt injection could query another user's data.
//
// Pure helpers (where-builder, row shaper) are exported for unit tests; the
// execute functions stay thin shells around Prisma.

const CATEGORIES = [
  "entertainment",
  "productivity",
  "ai",
  "cloud",
  "comm",
  "other",
] as const;

const querySubscriptionsInput = z.object({
  status: z
    .enum(["active", "cancelled", "hidden", "all"])
    .optional()
    .describe("訂閱狀態，省略時預設只回傳 active（使用中）的訂閱"),
  category: z
    .enum(CATEGORIES)
    .optional()
    .describe("只查特定分類時使用"),
  serviceName: z
    .string()
    .optional()
    .describe("只查單一服務時使用，例如 netflix 或 Netflix"),
});

export type SubscriptionFilter = z.infer<typeof querySubscriptionsInput>;

export function buildSubscriptionWhere(
  userId: string,
  filter: SubscriptionFilter,
): { userId: string; status?: string; category?: string; serviceName?: string } {
  const where: ReturnType<typeof buildSubscriptionWhere> = { userId };

  const status = filter.status ?? "active";
  if (status !== "all") where.status = status;

  if (filter.category) where.category = filter.category;

  if (filter.serviceName) {
    // Canonical ids pass through untouched — slugify would mangle
    // underscores ("youtube_premium" → "youtubepremium").
    where.serviceName = SERVICE_REGISTRY[filter.serviceName]
      ? filter.serviceName
      : normalizeServiceName(filter.serviceName).canonicalId;
  }

  return where;
}

// Accepts both Prisma rows (Decimal amounts) and plain objects.
type SubscriptionRow = {
  serviceName: string;
  displayName: string | null;
  amount: number | { toString(): string };
  currency: string;
  amountInTwd: number | { toString(): string };
  cycle: string;
  category: string;
  status: string;
  nextBillingDate: Date | null;
  isTrial: boolean;
  trialEndsAt: Date | null;
  lastSeenAt: Date;
};

// Curated payload for the LLM: numbers as numbers, dates as ISO date strings,
// no ids or FK noise. Every field here costs tokens on every agent step.
export function shapeSubscriptionForAgent(row: SubscriptionRow) {
  const amountInTwd = Number(row.amountInTwd);
  return {
    serviceName: row.serviceName,
    displayName: row.displayName,
    amount: Number(row.amount),
    currency: row.currency,
    amountInTwd,
    monthlyAmountTwd: Math.round(
      monthlyAmountTwd({ cycle: row.cycle, amountInTwd }),
    ),
    cycle: row.cycle,
    category: row.category,
    status: row.status,
    nextBillingDate: toIsoDate(row.nextBillingDate),
    isTrial: row.isTrial,
    trialEndsAt: toIsoDate(row.trialEndsAt),
    lastSeenAt: toIsoDate(row.lastSeenAt),
  };
}

function toIsoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function getServiceInfoForAgent(serviceName: string) {
  const knowledge = getServiceKnowledge(serviceName);
  // Expected miss → structured not-found so the agent can degrade gracefully
  // instead of the whole run failing.
  if (!knowledge) {
    return {
      found: false as const,
      serviceName,
      note: "知識庫沒有這個服務的資料，請根據使用者自己的帳單資料回答，不要猜測方案或價格。",
    };
  }
  return { found: true as const, ...knowledge };
}

export function buildAgentTools(userId: string) {
  return {
    query_subscriptions: tool({
      description:
        "查詢使用者目前的訂閱清單（服務、金額、週期、下次扣款日、分類、狀態）。" +
        "需要知道使用者「訂了什麼、花多少錢」時用這個。" +
        "不含歷史金額變化，也不含服務的方案知識。",
      inputSchema: querySubscriptionsInput,
      execute: async (filter) => {
        const rows = await db.subscription.findMany({
          where: buildSubscriptionWhere(userId, filter),
          orderBy: { amountInTwd: "desc" },
        });
        const subscriptions = rows.map(shapeSubscriptionForAgent);
        // Pre-computed so the model never does its own arithmetic.
        const { totalMonthlyTwd } = computeOverview(
          rows.map((r) => ({ cycle: r.cycle, amountInTwd: Number(r.amountInTwd) })),
        );
        return { count: subscriptions.length, totalMonthlyTwd, subscriptions };
      },
    }),

    get_service_info: tool({
      description:
        "查詢訂閱服務的公開知識：方案級距與定價、近期漲價歷史、家庭方案規則、取消訂閱網址。" +
        "需要判斷使用者「付的價格是否合理、有沒有更划算的方案、最近是否漲價」時用這個。" +
        "不含使用者自己的訂閱資料。",
      inputSchema: z.object({
        serviceName: z
          .string()
          .describe("服務名稱或 canonical ID，例如 netflix 或 Netflix"),
      }),
      execute: async ({ serviceName }) => getServiceInfoForAgent(serviceName),
    }),
  };
}
