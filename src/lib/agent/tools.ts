import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { computeOverview, monthlyAmountTwd } from "@/lib/queries/subscriptions";
import {
  SERVICE_REGISTRY,
  normalizeServiceName,
} from "@/lib/services/normalization";
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
    .describe(
      "Subscription status. Omit to get only active ones, which is the default.",
    ),
  category: z
    .enum(CATEGORIES)
    .optional()
    .describe("Set to look at one category only."),
  serviceName: z
    .string()
    .optional()
    .describe("Set to look at one service only, e.g. netflix or Netflix."),
});

export type SubscriptionFilter = z.infer<typeof querySubscriptionsInput>;

export function buildSubscriptionWhere(
  userId: string,
  filter: SubscriptionFilter,
): {
  userId: string;
  status?: string;
  category?: string;
  serviceName?: string;
} {
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
      note: "The knowledge base has nothing on this service. Answer from the user's own billing data and do not guess at plans or prices.",
    };
  }
  return { found: true as const, ...knowledge };
}

export function buildAgentTools(userId: string) {
  return {
    query_subscriptions: tool({
      description:
        "The user's current subscriptions: service, amount, cycle, next charge " +
        "date, category, status. Use this to find out what they subscribe to and " +
        "what it costs. Carries no price history and no knowledge about the " +
        "services themselves.",
      inputSchema: querySubscriptionsInput,
      execute: async (filter) => {
        const rows = await db.subscription.findMany({
          where: buildSubscriptionWhere(userId, filter),
          orderBy: { amountInTwd: "desc" },
        });
        const subscriptions = rows.map(shapeSubscriptionForAgent);
        // Pre-computed so the model never does its own arithmetic.
        const { totalMonthlyTwd } = computeOverview(
          rows.map((r) => ({
            cycle: r.cycle,
            amountInTwd: Number(r.amountInTwd),
          })),
        );
        return { count: subscriptions.length, totalMonthlyTwd, subscriptions };
      },
    }),

    get_service_info: tool({
      description:
        "Public knowledge about a service: plan tiers and pricing, recent price " +
        "increases, family-plan rules, cancellation URL. Use this to judge " +
        "whether what the user pays is reasonable, whether a cheaper plan " +
        "exists, or whether the service raised prices recently. Carries none of " +
        "the user's own data.",
      inputSchema: z.object({
        serviceName: z
          .string()
          .describe("Service name or canonical id, e.g. netflix or Netflix."),
      }),
      execute: async ({ serviceName }) => getServiceInfoForAgent(serviceName),
    }),

    calculate_trend: tool({
      description:
        "Spend trend computed from the user's billing history. Without " +
        "serviceName: overall monthly spend for the last N months in TWD, " +
        "including the comparison against last month. With serviceName: that " +
        "service's billed amounts over time plus any increases or decreases " +
        "detected. Use this to answer how spending moved, or whether a service " +
        "raised its price on this user. Do not call it twice with the same " +
        "arguments in one analysis.",
      inputSchema: z.object({
        serviceName: z
          .string()
          .optional()
          .describe(
            "Set for one service's price history; omit for overall monthly spend.",
          ),
        months: z
          .number()
          .int()
          .min(2)
          .max(12)
          .optional()
          .describe(
            "How many months the overall trend looks back. Defaults to 6; only meaningful without serviceName.",
          ),
      }),
      execute: async ({ serviceName, months }) => {
        if (!serviceName) {
          const points = await getMonthlyTrend(userId, months ?? 6);
          return {
            scope: "overall" as const,
            points,
            delta: computeMonthDelta(points),
          };
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
            note: "No billing events for this service, so there is no trend to compute. Check the service name, or use query_subscriptions to see what the user actually has.",
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
        "Scans the user's subscriptions for anomalous facts: duplicate " +
        "(several active subscriptions in one category), idle (no billing email " +
        "for a long time, possibly cancelled elsewhere), price_change (a " +
        "service's amount moved), upcoming_renewal (a charge due within 14 " +
        "days). Use this to build the list of things needing attention; omit " +
        "types to scan all four. What comes back are facts — whether each one " +
        "is really a problem is your call (two subscriptions in one category " +
        "are not necessarily duplicates).",
      inputSchema: z.object({
        types: z
          .array(z.enum(ANOMALY_TYPES))
          .optional()
          .describe("Which anomaly kinds to scan; omit to scan all of them."),
      }),
      execute: async ({ types }) =>
        detectAnomalies(userId, types ?? ANOMALY_TYPES),
    }),
  };
}
