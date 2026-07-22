import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { computeOverview, monthlyAmountTwd } from "@/lib/queries/subscriptions";
import { SERVICE_REGISTRY, normalizeServiceName } from "@/lib/services/normalization";
import { getServiceKnowledge } from "@/lib/services/knowledge";
import {
  computeMonthDelta,
  computeServiceHistory,
  getMonthlyTrend,
} from "@/lib/queries/monthly-trend";
import { ANOMALY_TYPES, detectAnomalies } from "@/lib/queries/anomalies";

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
    where.serviceName = toCanonicalId(filter.serviceName);
  }

  return where;
}

// Canonical ids pass through untouched — slugify would mangle
// underscores ("youtube_premium" → "youtubepremium").
export function toCanonicalId(raw: string): string {
  return SERVICE_REGISTRY[raw] ? raw : normalizeServiceName(raw).canonicalId;
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

    calculate_trend: tool({
      description:
        "從使用者的歷史帳單計算消費趨勢。不帶 serviceName：回傳最近 N 個月的整體月支出趨勢" +
        "（TWD、含上月比較）。帶 serviceName：回傳該服務的歷史帳單金額列表與偵測到的漲降價。" +
        "需要回答「花費怎麼變化、某服務對使用者漲過價嗎」時用這個。同一次分析不要重複查同樣的參數。",
      inputSchema: z.object({
        serviceName: z
          .string()
          .optional()
          .describe("要查單一服務的價格歷史時使用；省略時回傳整體月支出趨勢"),
        months: z
          .number()
          .int()
          .min(2)
          .max(12)
          .optional()
          .describe("整體趨勢回看的月數，預設 6，只在不帶 serviceName 時有意義"),
      }),
      execute: async ({ serviceName, months }) => {
        if (!serviceName) {
          const points = await getMonthlyTrend(userId, months ?? 6);
          return { scope: "overall" as const, points, delta: computeMonthDelta(points) };
        }

        const canonicalId = toCanonicalId(serviceName);
        const rows = await db.billingEvent.findMany({
          where: { userId, serviceName: canonicalId },
          select: {
            amount: true,
            currency: true,
            amountInTwd: true,
            cycle: true,
            emailSignalType: true,
            emailReceivedAt: true,
          },
        });
        const { points, priceChanges } = computeServiceHistory(
          rows.map((r) => ({
            amount: Number(r.amount),
            currency: r.currency,
            amountInTwd: Number(r.amountInTwd),
            cycle: r.cycle,
            emailSignalType: r.emailSignalType,
            emailReceivedAt: r.emailReceivedAt,
          })),
        );
        // Expected miss → structured not-found, same pattern as
        // getServiceInfoForAgent: the agent degrades instead of failing.
        if (points.length === 0) {
          return {
            scope: "service" as const,
            found: false as const,
            serviceName: canonicalId,
            note: "帳單紀錄裡沒有這個服務的金額事件，無法計算趨勢。請確認服務名稱，或改用 query_subscriptions 看使用者訂了什麼。",
          };
        }
        return {
          scope: "service" as const,
          found: true as const,
          serviceName: canonicalId,
          points,
          priceChanges,
        };
      },
    }),

    detect_anomalies: tool({
      description:
        "掃描使用者訂閱的異常事實：duplicate（同分類有多個使用中訂閱）、idle（太久沒收到帳單信，" +
        "可能已在外部取消）、price_change（同服務金額變動）、upcoming_renewal（14 天內即將扣款或" +
        "試用到期）。要產生「需要注意的事項」清單時用這個；不帶 types 就四種全掃。" +
        "回傳的是事實，是否真的算問題由你判斷（例如同分類兩個訂閱不一定重複）。",
      inputSchema: z.object({
        types: z
          .array(z.enum(ANOMALY_TYPES))
          .optional()
          .describe("要掃描的異常種類，省略時全部掃描"),
      }),
      execute: async ({ types }) => detectAnomalies(userId, types ?? ANOMALY_TYPES),
    }),
  };
}
