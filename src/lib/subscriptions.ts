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
