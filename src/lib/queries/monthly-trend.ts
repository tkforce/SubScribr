import { db } from "@/lib/db";

// ---------- Pure computation ----------

export type TrendEvent = {
  amountInTwd: number;
  cycle: string;
  emailSignalType: string;
  emailReceivedAt: Date;
};

export type MonthlyTrendPoint = {
  month: string; // "YYYY-MM"
  totalTwd: number;
};

// How many calendar months one billing event's charge covers.
// one-time and unknown cycles are not recurring spend — they contribute 0,
// same semantics as monthlyAmountTwd in subscriptions.ts.
const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

function monthKey(year: number, monthIndex: number): string {
  // normalize via Date so monthIndex may be out of [0,11]
  const d = new Date(year, monthIndex, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Amortized monthly spend: each billing event covers CYCLE_MONTHS[cycle]
// calendar months starting at its own month, contributing amount/N to each.
// Pure fold over events — no I/O. Callers must pass events whose coverage can
// reach the window, i.e. query from (window start − 12 months).
export function computeMonthlySpend(
  events: TrendEvent[],
  monthsBack: number,
  now: Date,
): MonthlyTrendPoint[] {
  const keys: string[] = [];
  const buckets = new Map<string, number>();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const key = monthKey(now.getFullYear(), now.getMonth() - i);
    keys.push(key);
    buckets.set(key, 0);
  }

  for (const e of events) {
    if (e.emailSignalType !== "billing") continue;
    const n = CYCLE_MONTHS[e.cycle];
    if (n === undefined) continue;
    const perMonth = e.amountInTwd / n;
    const y = e.emailReceivedAt.getFullYear();
    const m = e.emailReceivedAt.getMonth();
    for (let i = 0; i < n; i++) {
      const key = monthKey(y, m + i);
      const current = buckets.get(key);
      if (current !== undefined) buckets.set(key, current + perMonth);
    }
  }

  return keys.map((k) => ({
    month: k,
    totalTwd: Math.round(buckets.get(k) ?? 0),
  }));
}

export type MonthDelta = {
  deltaTwd: number;
  pctChange: number | null; // null when the previous month had no spend
};

// Month-over-month change from the last two trend points. Null when there is
// nothing to compare: fewer than two points, or no spend in either month.
export function computeMonthDelta(
  points: MonthlyTrendPoint[],
): MonthDelta | null {
  if (points.length < 2) return null;
  const current = points[points.length - 1].totalTwd;
  const previous = points[points.length - 2].totalTwd;
  if (current === 0 && previous === 0) return null;
  return {
    deltaTwd: current - previous,
    pctChange: previous === 0 ? null : (current - previous) / previous,
  };
}

// ---------- Per-service price history ----------

// Signal types that carry a real charge/price figure. Mirrors the derive
// fold in subscription-derive.ts — keep the two lists in sync.
const AMOUNT_BEARING_SIGNALS = new Set([
  "billing",
  "price_change",
  "renewal_notice",
]);

export type ServiceHistoryEvent = {
  amount: number;
  currency: string;
  amountInTwd: number;
  cycle: string;
  emailSignalType: string;
  emailReceivedAt: Date;
};

export type ServiceHistoryPoint = {
  date: string; // "YYYY-MM-DD", local calendar date
  amount: number;
  currency: string;
  amountInTwd: number;
  cycle: string;
  emailSignalType: string;
};

export type PriceChange = {
  date: string; // date of the event that introduced the new price
  fromTwd: number;
  toTwd: number;
  pctChange: number; // (to - from) / from, rounded to 3 decimals
};

export function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Price history of one service from its billing events. Pure — no I/O.
// A cycle switch (monthly→yearly) is a plan change, not a price change:
// comparing amounts across cycles would report nonsense like +1100%.
export function computeServiceHistory(events: ServiceHistoryEvent[]): {
  points: ServiceHistoryPoint[];
  priceChanges: PriceChange[];
} {
  const sorted = events
    .filter((e) => AMOUNT_BEARING_SIGNALS.has(e.emailSignalType))
    .sort((a, b) => a.emailReceivedAt.getTime() - b.emailReceivedAt.getTime());

  const points: ServiceHistoryPoint[] = sorted.map((e) => ({
    date: localIsoDate(e.emailReceivedAt),
    amount: e.amount,
    currency: e.currency,
    amountInTwd: e.amountInTwd,
    cycle: e.cycle,
    emailSignalType: e.emailSignalType,
  }));

  const priceChanges: PriceChange[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.cycle !== prev.cycle) continue;
    if (curr.amountInTwd === prev.amountInTwd) continue;
    priceChanges.push({
      date: localIsoDate(curr.emailReceivedAt),
      fromTwd: prev.amountInTwd,
      toTwd: curr.amountInTwd,
      pctChange:
        Math.round(((curr.amountInTwd - prev.amountInTwd) / prev.amountInTwd) * 1000) /
        1000,
    });
  }

  return { points, priceChanges };
}

// ---------- I/O orchestrator ----------

// Longest cycle is yearly: an event up to 12 months before the window start
// can still cover months inside the window, so the query bound reaches back
// windowStart − 12 months. Hidden subscriptions are excluded entirely;
// cancelled ones still count — their covered months were real spend.
export async function getMonthlyTrend(
  userId: string,
  monthsBack = 6,
  now: Date = new Date(),
): Promise<MonthlyTrendPoint[]> {
  const hidden = await db.subscription.findMany({
    where: { userId, status: "hidden" },
    select: { serviceName: true },
  });
  const hiddenNames = hidden.map((h) => h.serviceName);

  const queryStart = new Date(
    now.getFullYear(),
    now.getMonth() - (monthsBack - 1) - 12,
    1,
  );

  const rows = await db.billingEvent.findMany({
    where: {
      userId,
      emailSignalType: "billing",
      emailReceivedAt: { gte: queryStart },
      ...(hiddenNames.length > 0
        ? { serviceName: { notIn: hiddenNames } }
        : {}),
    },
    select: {
      amountInTwd: true,
      cycle: true,
      emailSignalType: true,
      emailReceivedAt: true,
    },
  });

  const events: TrendEvent[] = rows.map((r) => ({
    amountInTwd: Number(r.amountInTwd),
    cycle: r.cycle,
    emailSignalType: r.emailSignalType,
    emailReceivedAt: r.emailReceivedAt,
  }));

  return computeMonthlySpend(events, monthsBack, now);
}
