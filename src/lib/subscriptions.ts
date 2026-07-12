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
  isTrial: boolean;
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

// Active subscriptions for a user, Decimal→number, sorted by monthly spend desc.
export async function getActiveSubscriptions(
  userId: string,
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
    nextBillingDate: r.nextBillingDate,
    isTrial: r.isTrial,
  }));
  subs.sort((a, b) => monthlyAmountTwd(b) - monthlyAmountTwd(a));
  return subs;
}
