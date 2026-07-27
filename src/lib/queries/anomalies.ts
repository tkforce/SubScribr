import { db } from "@/lib/db";
import {
  monthlyAmountTwd,
  projectNextBilling,
} from "@/lib/queries/subscriptions";
import {
  computeServiceHistory,
  localIsoDate,
  type ServiceHistoryEvent,
} from "@/lib/queries/monthly-trend";

// Anomaly detectors (F7 detect_anomalies / section 8a). Code surfaces facts
// deterministically; whether a fact is actually a problem (e.g. Spotify +
// YouTube Premium both playing music) is the LLM's judgment call.
//
// Detectors are pure and take plain rows; detectAnomalies at the bottom is
// the only I/O orchestrator.

export type AnomalySub = {
  serviceName: string;
  displayName: string | null;
  category: string;
  status: string;
  cycle: string;
  amountInTwd: number;
  nextBillingDate: Date | null;
  lastSeenAt: Date;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Calendar-day distance ignoring time-of-day, negative when target is past.
function daysBetween(from: Date, to: Date): number {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(to) - startOfDay(from)) / MS_PER_DAY);
}

// ---------- duplicate ----------

export type DuplicateGroup = {
  category: string;
  services: string[];
  combinedMonthlyTwd: number;
};

// ≥2 active subscriptions in the same category. Overlap is a fact; whether
// it's redundant is for the LLM to judge against service knowledge.
export function detectDuplicates(subs: AnomalySub[]): DuplicateGroup[] {
  const byCategory = new Map<string, AnomalySub[]>();
  for (const s of subs) {
    if (s.status !== "active") continue;
    const group = byCategory.get(s.category) ?? [];
    group.push(s);
    byCategory.set(s.category, group);
  }

  const out: DuplicateGroup[] = [];
  for (const [category, group] of byCategory) {
    if (group.length < 2) continue;
    out.push({
      category,
      services: group.map((s) => s.serviceName),
      combinedMonthlyTwd: Math.round(
        group.reduce((sum, s) => sum + monthlyAmountTwd(s), 0),
      ),
    });
  }
  return out;
}

// ---------- idle ----------

// No email for 2+ cycles suggests the subscription may have been cancelled
// without a cancellation email (or the card expired). Yearly gets a long rope:
// one email a year is normal.
const IDLE_THRESHOLD_DAYS: Record<string, number> = {
  monthly: 60,
  quarterly: 180,
  yearly: 730,
};

export type IdleSubscription = {
  serviceName: string;
  cycle: string;
  lastSeenAt: string; // "YYYY-MM-DD"
  daysSinceLastSeen: number;
};

export function detectIdle(subs: AnomalySub[], now: Date): IdleSubscription[] {
  const out: IdleSubscription[] = [];
  for (const s of subs) {
    if (s.status !== "active") continue;
    const threshold = IDLE_THRESHOLD_DAYS[s.cycle];
    if (threshold === undefined) continue;
    const days = daysBetween(s.lastSeenAt, now);
    if (days <= threshold) continue;
    out.push({
      serviceName: s.serviceName,
      cycle: s.cycle,
      lastSeenAt: localIsoDate(s.lastSeenAt),
      daysSinceLastSeen: days,
    });
  }
  return out;
}

// ---------- price_change ----------

export type PriceChangeEvent = ServiceHistoryEvent & { serviceName: string };

export type ServicePriceChange = {
  serviceName: string;
  date: string;
  currency: string;
  from: number;
  to: number;
  pctChange: number;
};

// Per-service consecutive-amount comparison, delegated to
// computeServiceHistory so tool and dashboard share one definition.
export function detectPriceChanges(
  events: PriceChangeEvent[],
): ServicePriceChange[] {
  const byService = new Map<string, PriceChangeEvent[]>();
  for (const e of events) {
    const group = byService.get(e.serviceName) ?? [];
    group.push(e);
    byService.set(e.serviceName, group);
  }

  const out: ServicePriceChange[] = [];
  for (const [serviceName, group] of byService) {
    for (const change of computeServiceHistory(group).priceChanges) {
      out.push({ serviceName, ...change });
    }
  }
  return out;
}

// ---------- upcoming_renewal ----------

export const UPCOMING_WINDOW_DAYS = 14;

export type UpcomingItem = {
  serviceName: string;
  kind: "renewal";
  date: string;
  daysUntil: number;
  amountInTwd: number;
  cycle: string;
};

// Renewals landing within the window. Past dates are stale data, not an
// imminent charge — excluded, same rule as upcomingBilling.
export function detectUpcomingRenewals(
  subs: AnomalySub[],
  now: Date,
): UpcomingItem[] {
  const out: UpcomingItem[] = [];
  for (const s of subs) {
    if (s.status !== "active") continue;
    const push = (kind: UpcomingItem["kind"], date: Date | null) => {
      if (!date) return;
      const days = daysBetween(now, date);
      if (days < 0 || days > UPCOMING_WINDOW_DAYS) return;
      out.push({
        serviceName: s.serviceName,
        kind,
        date: localIsoDate(date),
        daysUntil: days,
        amountInTwd: s.amountInTwd,
        cycle: s.cycle,
      });
    };
    push("renewal", s.nextBillingDate);
  }
  out.sort((a, b) => a.daysUntil - b.daysUntil);
  return out;
}

// ---------- I/O orchestrator ----------

export const ANOMALY_TYPES = [
  "duplicate",
  "idle",
  "price_change",
  "upcoming_renewal",
] as const;

export type AnomalyType = (typeof ANOMALY_TYPES)[number];

export type AnomalyReport = {
  duplicates?: DuplicateGroup[];
  idle?: IdleSubscription[];
  priceChanges?: ServicePriceChange[];
  upcomingRenewals?: UpcomingItem[];
};

export async function detectAnomalies(
  userId: string,
  types: readonly AnomalyType[] = ANOMALY_TYPES,
  now: Date = new Date(),
): Promise<AnomalyReport> {
  const rows = await db.subscription.findMany({ where: { userId } });
  const subs: AnomalySub[] = rows.map((r) => ({
    serviceName: r.serviceName,
    displayName: r.displayName,
    category: r.category,
    status: r.status,
    cycle: r.cycle,
    amountInTwd: Number(r.amountInTwd),
    // Projected from lastSeenAt + cycle, same as the dashboard list — the
    // stored column is never written, which is why upcoming_renewal never
    // fired before.
    nextBillingDate: projectNextBilling(r.lastSeenAt, r.cycle, now),
    lastSeenAt: r.lastSeenAt,
  }));

  const report: AnomalyReport = {};
  if (types.includes("duplicate")) report.duplicates = detectDuplicates(subs);
  if (types.includes("idle")) report.idle = detectIdle(subs, now);
  if (types.includes("upcoming_renewal"))
    report.upcomingRenewals = detectUpcomingRenewals(subs, now);

  if (types.includes("price_change")) {
    // Hidden subscriptions are excluded from analysis output entirely,
    // consistent with getMonthlyTrend.
    const hiddenNames = subs
      .filter((s) => s.status === "hidden")
      .map((s) => s.serviceName);
    const queryStart = new Date(
      now.getFullYear(),
      now.getMonth() - 12,
      now.getDate(),
    );
    const eventRows = await db.billingEvent.findMany({
      where: {
        userId,
        emailReceivedAt: { gte: queryStart },
        ...(hiddenNames.length > 0
          ? { serviceName: { notIn: hiddenNames } }
          : {}),
      },
      select: {
        serviceName: true,
        amount: true,
        currency: true,
        amountInTwd: true,
        cycle: true,
        emailSignalType: true,
        emailReceivedAt: true,
      },
    });
    report.priceChanges = detectPriceChanges(
      eventRows.map((r) => ({
        serviceName: r.serviceName,
        amount: Number(r.amount),
        currency: r.currency,
        amountInTwd: Number(r.amountInTwd),
        cycle: r.cycle,
        emailSignalType: r.emailSignalType,
        emailReceivedAt: r.emailReceivedAt,
      })),
    );
  }

  return report;
}
