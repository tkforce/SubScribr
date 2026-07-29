import { db } from "@/lib/db";

export type SubscriptionView = {
  id: string;
  serviceName: string;
  displayName: string | null;
  amount: number;
  currency: string;
  amountInTwd: number;
  cycle: string;
  category: string;
  status: string;
  nextBillingDate: Date | null;
};

// Normalize any billing cycle to an equivalent monthly TWD figure.
// one-time and unknown cycles contribute 0 — they are not recurring spend.
export function monthlyAmountTwd(sub: {
  cycle: string;
  amountInTwd: number;
}): number {
  switch (sub.cycle) {
    case "monthly":
      return sub.amountInTwd;
    case "yearly":
      return sub.amountInTwd / 12;
    case "quarterly":
      return sub.amountInTwd / 3;
    default:
      return 0;
  }
}

export function computeOverview(
  subs: { cycle: string; amountInTwd: number }[],
): { totalMonthlyTwd: number; activeCount: number } {
  const total = subs.reduce((sum, s) => sum + monthlyAmountTwd(s), 0);
  return { totalMonthlyTwd: Math.round(total), activeCount: subs.length };
}

// Months per cycle. Cycles absent here don't recur, so they have no next date.
const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

// Add months, clamping to the last valid day of the target month. Plain
// setMonth overflows — Jan 31 + 1 month becomes Mar 3, not Feb 28.
function addMonths(d: Date, months: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return target;
}

// Project the next charge from the most recent billing email plus one cycle.
//
// This is a projection, not the date the email stated. The LLM does extract a
// nextBillingDate, but BillingEvent has no column for it, so it never reaches
// the derived Subscription — computing it here needs no schema change and
// works on existing rows. The tradeoff: it assumes the email arrived on the
// charge date, which holds for `billing` receipts but runs early by up to a
// week for `renewal_notice` ("renews in 7 days").
//
// Steps are measured from the original anchor rather than from the previous
// result, so a month that clamps (Jan 31 → Feb 28) doesn't drag every later
// date down with it.
export function projectNextBilling(
  lastSeenAt: Date,
  cycle: string,
  now: Date,
): Date | null {
  const step = CYCLE_MONTHS[cycle];
  if (!step) return null;

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);

  // A charge dated today already happened, so roll strictly past it. The cap
  // is a guard against a garbage anchor date, not an expected path: even a
  // decade-stale monthly subscription needs only ~120 steps.
  for (let k = 1; k <= 1200; k++) {
    const next = addMonths(lastSeenAt, step * k);
    if (startOfDay(next) > today) return next;
  }
  return null;
}

export type UpcomingBilling = {
  days: number;
  label: string;
};

// Calendar-day distance to the next billing, when it lands within 7 days.
// Past dates are stale data, not an imminent charge — they return null.
export function upcomingBilling(
  nextBillingDate: Date | null,
  now: Date,
): UpcomingBilling | null {
  if (!nextBillingDate) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (startOfDay(nextBillingDate) - startOfDay(now)) / msPerDay,
  );
  if (days < 0 || days > 7) return null;
  const label =
    days === 0 ? "今天扣款" : days === 1 ? "明天扣款" : `${days} 天後扣款`;
  return { days, label };
}

// Every Subscription row regardless of status, which is the test for "is there
// anything on this dashboard at all". Deliberately unfiltered: an account whose
// subscriptions are all cancelled has an empty list but a real trend chart, so
// it still belongs on the dashboard rather than the nothing-found screen.
export async function countAllSubscriptions(userId: string): Promise<number> {
  return db.subscription.count({ where: { userId } });
}

// Distinguishes the two ways a subscription list can be empty: nothing is
// active right now, versus nothing was ever recognised. The counters from a
// live run are gone after the page refreshes, so the empty state reads this
// instead — it comes from stored rows and therefore survives reloads.
export async function countBillingEvents(userId: string): Promise<number> {
  return db.billingEvent.count({ where: { userId } });
}

// Active subscriptions for a user, Decimal→number, sorted by monthly spend desc.
export async function getActiveSubscriptions(
  userId: string,
  now: Date = new Date(),
): Promise<SubscriptionView[]> {
  const rows = await db.subscription.findMany({
    where: { userId, status: "active" },
  });
  const subs: SubscriptionView[] = rows.map((r) => ({
    id: r.id,
    serviceName: r.serviceName,
    displayName: r.displayName,
    amount: Number(r.amount),
    currency: r.currency,
    amountInTwd: Number(r.amountInTwd),
    cycle: r.cycle,
    category: r.category,
    status: r.status,
    // Projected, not read from the column: nothing ever writes it (see
    // projectNextBilling), so r.nextBillingDate is null on every row.
    nextBillingDate: projectNextBilling(r.lastSeenAt, r.cycle, now),
  }));
  subs.sort((a, b) => monthlyAmountTwd(b) - monthlyAmountTwd(a));
  return subs;
}
