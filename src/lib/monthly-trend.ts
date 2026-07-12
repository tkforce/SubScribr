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
