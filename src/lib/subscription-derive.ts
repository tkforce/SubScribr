import { db } from "@/lib/db";
import { SERVICE_REGISTRY } from "@/lib/service-normalization";

// ---------- Pure derive ----------

export type DeriveEvent = {
  serviceName: string;
  amount: number;
  amountInTwd: number;
  currency: string;
  cycle: string;
  category?: string | null;
  emailSignalType: string;
  emailReceivedAt: Date;
};

export type DerivedState = {
  serviceName: string;
  amount: number;
  amountInTwd: number;
  currency: string;
  cycle: string;
  category: string;
  status: string;
  cancelledAt: Date | null;
  isTrial: boolean;
  trialEndsAt: Date | null;
  nextBillingDate: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

// Signals that prove a billing relationship exists. A service whose entire
// event log is only soft signals (we_miss_you, trial_reminder) has no
// evidence of an actual subscription — don't materialize one.
const CONCRETE_SIGNALS = new Set([
  "billing",
  "price_change",
  "renewal_notice",
  "cancellation",
]);

// Fold sorted events into final Subscription state. No I/O.
// Returns null on empty input or when no concrete signal is present.
export function deriveSubscriptionState(
  events: DeriveEvent[],
): DerivedState | null {
  if (events.length === 0) return null;
  if (!events.some((e) => CONCRETE_SIGNALS.has(e.emailSignalType))) {
    return null;
  }

  const sorted = [...events].sort(
    (a, b) => a.emailReceivedAt.getTime() - b.emailReceivedAt.getTime(),
  );

  const state: DerivedState = {
    serviceName: sorted[0].serviceName,
    amount: 0,
    amountInTwd: 0,
    currency: "TWD",
    cycle: "monthly",
    category: "other",
    status: "active",
    cancelledAt: null,
    isTrial: false,
    trialEndsAt: null,
    nextBillingDate: null,
    firstSeenAt: sorted[0].emailReceivedAt,
    lastSeenAt: sorted[sorted.length - 1].emailReceivedAt,
  };

  // Registry category is authoritative for registered services; otherwise the
  // latest non-null LLM category across the event log wins, then "other".
  let llmCategory: string | null = null;

  for (const e of sorted) {
    if (e.category) llmCategory = e.category;
    switch (e.emailSignalType) {
      case "billing":
      case "price_change":
      case "renewal_notice":
        state.amount = e.amount;
        state.amountInTwd = e.amountInTwd;
        state.currency = e.currency;
        state.cycle = e.cycle;
        if (state.status === "cancelled") {
          state.status = "active";
          state.cancelledAt = null;
        }
        break;
      case "cancellation":
        state.status = "cancelled";
        state.cancelledAt = e.emailReceivedAt;
        break;
      case "trial_reminder":
        state.isTrial = true;
        break;
      case "we_miss_you":
        break;
    }
  }

  state.category =
    SERVICE_REGISTRY[state.serviceName]?.category ?? llmCategory ?? "other";

  return state;
}

// ---------- I/O orchestrator ----------

export async function upsertSubscriptionsForServices(
  userId: string,
  serviceNames: Iterable<string>,
): Promise<number> {
  let upsertedCount = 0;

  for (const serviceName of serviceNames) {
    const billingEvents = await db.billingEvent.findMany({
      where: { userId, serviceName },
      orderBy: { emailReceivedAt: "asc" },
      select: {
        serviceName: true,
        amount: true,
        amountInTwd: true,
        currency: true,
        cycle: true,
        category: true,
        emailSignalType: true,
        emailReceivedAt: true,
      },
    });

    if (billingEvents.length === 0) continue;

    const eventsFromService: DeriveEvent[] = billingEvents.map((e) => ({
      serviceName: e.serviceName,
      amount: Number(e.amount),
      amountInTwd: Number(e.amountInTwd),
      currency: e.currency,
      cycle: e.cycle,
      category: e.category,
      emailSignalType: e.emailSignalType,
      emailReceivedAt: e.emailReceivedAt,
    }));

    const state = deriveSubscriptionState(eventsFromService);
    if (!state) continue;

    const sub = await db.subscription.upsert({
      where: { userId_serviceName: { userId, serviceName } },
      create: {
        userId,
        serviceName: state.serviceName,
        amount: state.amount,
        amountInTwd: state.amountInTwd,
        currency: state.currency,
        cycle: state.cycle,
        category: state.category,
        status: state.status,
        cancelledAt: state.cancelledAt,
        isTrial: state.isTrial,
        trialEndsAt: state.trialEndsAt,
        nextBillingDate: state.nextBillingDate,
        firstSeenAt: state.firstSeenAt,
        lastSeenAt: state.lastSeenAt,
        source: "gmail",
      },
      update: {
        amount: state.amount,
        amountInTwd: state.amountInTwd,
        currency: state.currency,
        cycle: state.cycle,
        category: state.category,
        status: state.status,
        cancelledAt: state.cancelledAt,
        isTrial: state.isTrial,
        trialEndsAt: state.trialEndsAt,
        nextBillingDate: state.nextBillingDate,
        firstSeenAt: state.firstSeenAt,
        lastSeenAt: state.lastSeenAt,
      },
    });

    await db.billingEvent.updateMany({
      where: { userId, serviceName, subscriptionId: null },
      data: { subscriptionId: sub.id },
    });

    upsertedCount += 1;
  }

  return upsertedCount;
}
