import { describe, it, expect } from "vitest";
import {
  deriveSubscriptionState,
  type DeriveEvent,
} from "./derive";

function ev(partial: Partial<DeriveEvent> & {
  emailReceivedAt: Date;
  emailSignalType: string;
}): DeriveEvent {
  return {
    serviceName: "netflix",
    amount: 390,
    amountInTwd: 390,
    currency: "TWD",
    cycle: "monthly",
    ...partial,
  };
}

describe("deriveSubscriptionState", () => {
  it("returns null on empty events", () => {
    expect(deriveSubscriptionState([])).toBeNull();
  });

  it("single billing event → active state with that event's amount", () => {
    const s = deriveSubscriptionState([
      ev({
        emailReceivedAt: new Date("2026-01-15"),
        emailSignalType: "billing",
        amount: 390,
      }),
    ]);
    expect(s).not.toBeNull();
    expect(s!.status).toBe("active");
    expect(s!.amount).toBe(390);
    expect(s!.firstSeenAt).toEqual(new Date("2026-01-15"));
    expect(s!.lastSeenAt).toEqual(new Date("2026-01-15"));
  });

  it("two billing events → latest amount wins", () => {
    const s = deriveSubscriptionState([
      ev({
        emailReceivedAt: new Date("2026-01-15"),
        emailSignalType: "billing",
        amount: 390,
      }),
      ev({
        emailReceivedAt: new Date("2026-02-15"),
        emailSignalType: "billing",
        amount: 420,
      }),
    ]);
    expect(s!.amount).toBe(420);
    expect(s!.lastSeenAt).toEqual(new Date("2026-02-15"));
  });

  it("billing → cancellation → status cancelled, cancelledAt set", () => {
    const s = deriveSubscriptionState([
      ev({
        emailReceivedAt: new Date("2026-01-15"),
        emailSignalType: "billing",
        amount: 390,
      }),
      ev({
        emailReceivedAt: new Date("2026-03-20"),
        emailSignalType: "cancellation",
      }),
    ]);
    expect(s!.status).toBe("cancelled");
    expect(s!.cancelledAt).toEqual(new Date("2026-03-20"));
  });

  it("billing → cancellation → billing again → re-active, cancelledAt null", () => {
    const s = deriveSubscriptionState([
      ev({
        emailReceivedAt: new Date("2026-01-15"),
        emailSignalType: "billing",
        amount: 390,
      }),
      ev({
        emailReceivedAt: new Date("2026-03-20"),
        emailSignalType: "cancellation",
      }),
      ev({
        emailReceivedAt: new Date("2026-05-15"),
        emailSignalType: "billing",
        amount: 390,
      }),
    ]);
    expect(s!.status).toBe("active");
    expect(s!.cancelledAt).toBeNull();
  });

  it("price_change updates amount", () => {
    const s = deriveSubscriptionState([
      ev({
        emailReceivedAt: new Date("2026-01-15"),
        emailSignalType: "billing",
        amount: 390,
      }),
      ev({
        emailReceivedAt: new Date("2026-03-01"),
        emailSignalType: "price_change",
        amount: 450,
      }),
    ]);
    expect(s!.amount).toBe(450);
  });

  it("out-of-order input is sorted before fold", () => {
    const s = deriveSubscriptionState([
      ev({
        emailReceivedAt: new Date("2026-05-15"),
        emailSignalType: "billing",
        amount: 450,
      }),
      ev({
        emailReceivedAt: new Date("2026-01-15"),
        emailSignalType: "billing",
        amount: 390,
      }),
      ev({
        emailReceivedAt: new Date("2026-03-20"),
        emailSignalType: "cancellation",
      }),
    ]);
    // Chronological order: billing(390) → cancellation → billing(450)
    // Final: re-activated, amount=450
    expect(s!.status).toBe("active");
    expect(s!.amount).toBe(450);
    expect(s!.firstSeenAt).toEqual(new Date("2026-01-15"));
    expect(s!.lastSeenAt).toEqual(new Date("2026-05-15"));
  });

  it("trial_reminder sets isTrial=true", () => {
    const s = deriveSubscriptionState([
      ev({
        emailReceivedAt: new Date("2026-01-01"),
        emailSignalType: "trial_reminder",
      }),
      ev({
        emailReceivedAt: new Date("2026-01-15"),
        emailSignalType: "billing",
        amount: 390,
      }),
    ]);
    expect(s!.isTrial).toBe(true);
  });

  it("we_miss_you alone produces no subscription (no concrete signal)", () => {
    const s = deriveSubscriptionState([
      ev({
        emailReceivedAt: new Date("2026-02-01"),
        emailSignalType: "we_miss_you",
      }),
    ]);
    expect(s).toBeNull();
  });

  it("trial_reminder alone produces no subscription (no concrete signal)", () => {
    const s = deriveSubscriptionState([
      ev({
        emailReceivedAt: new Date("2026-01-01"),
        emailSignalType: "trial_reminder",
      }),
    ]);
    expect(s).toBeNull();
  });

  it("uses SERVICE_REGISTRY category when serviceName is registered", () => {
    const s = deriveSubscriptionState([
      ev({
        serviceName: "claude",
        emailReceivedAt: new Date("2026-01-15"),
        emailSignalType: "billing",
      }),
    ]);
    expect(s!.category).toBe("ai");
  });

  it("unregistered service uses the LLM category from events", () => {
    const s = deriveSubscriptionState([
      ev({
        serviceName: "some-unknown-service",
        emailReceivedAt: new Date("2026-01-15"),
        emailSignalType: "billing",
        category: "productivity",
      }),
    ]);
    expect(s!.category).toBe("productivity");
  });

  it("unregistered service with multiple categories → latest non-null wins", () => {
    const s = deriveSubscriptionState([
      ev({
        serviceName: "some-unknown-service",
        emailReceivedAt: new Date("2026-01-15"),
        emailSignalType: "billing",
        category: "entertainment",
      }),
      ev({
        serviceName: "some-unknown-service",
        emailReceivedAt: new Date("2026-02-15"),
        emailSignalType: "billing",
        category: "productivity",
      }),
      ev({
        serviceName: "some-unknown-service",
        emailReceivedAt: new Date("2026-03-15"),
        emailSignalType: "billing",
        category: null,
      }),
    ]);
    expect(s!.category).toBe("productivity");
  });

  it("registry category beats LLM category for registered services", () => {
    const s = deriveSubscriptionState([
      ev({
        serviceName: "claude",
        emailReceivedAt: new Date("2026-01-15"),
        emailSignalType: "billing",
        category: "productivity",
      }),
    ]);
    expect(s!.category).toBe("ai");
  });

  it("falls back to 'other' for unregistered services with no LLM category", () => {
    const s = deriveSubscriptionState([
      ev({
        serviceName: "some-unknown-service",
        emailReceivedAt: new Date("2026-01-15"),
        emailSignalType: "billing",
      }),
    ]);
    expect(s!.category).toBe("other");
  });

  it("trial_reminder + we_miss_you (both soft) still produces no subscription", () => {
    const s = deriveSubscriptionState([
      ev({
        emailReceivedAt: new Date("2026-01-01"),
        emailSignalType: "trial_reminder",
      }),
      ev({
        emailReceivedAt: new Date("2026-02-01"),
        emailSignalType: "we_miss_you",
      }),
    ]);
    expect(s).toBeNull();
  });
});
