import { describe, it, expect } from "vitest";
import { buildGoldenDraft, type GoldenEntry, type DraftInput } from "./golden";

function input(over: Partial<DraftInput> = {}): DraftInput {
  return {
    id: "e1",
    from: "Netflix <no-reply@netflix.com>",
    subject: "您的 Netflix 會員資格 — 收據",
    body: "Netflix 標準方案 NT$390",
    outcome: "extracted",
    extraction: {
      isSubscriptionRelated: true,
      rawServiceName: "Netflix",
      amount: 390,
      currency: "TWD",
      cycle: "monthly",
      category: "entertainment",
      emailSignalType: "billing",
    },
    ...over,
  };
}

describe("buildGoldenDraft", () => {
  it("pre-fills golden from the LLM extraction and marks it unreviewed", () => {
    const { entries, stats } = buildGoldenDraft([input()]);

    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.reviewed).toBe(false);
    expect(e.llmGuess).toEqual(input().extraction);
    // golden starts as a copy of the guess so the reviewer only edits wrong cells
    expect(e.golden).toEqual(input().extraction);
    // ...but a copy, not the same reference, so editing golden can't mutate llmGuess
    expect(e.golden).not.toBe(e.llmGuess);
    expect(stats).toMatchObject({ total: 1, added: 1, refreshed: 0, preservedReviewed: 0 });
  });

  it("defaults golden to not-subscription when there is no extraction", () => {
    const { entries } = buildGoldenDraft([
      input({ outcome: "blacklisted", extraction: null }),
    ]);
    expect(entries[0].llmGuess).toBeNull();
    expect(entries[0].golden).toEqual({ isSubscriptionRelated: false });
  });

  it("preserves a reviewed entry untouched even when the new draft disagrees", () => {
    const reviewed: GoldenEntry = {
      id: "e1",
      from: "x",
      subject: "x",
      body: "x",
      outcome: "extracted",
      llmGuess: { isSubscriptionRelated: true },
      golden: { isSubscriptionRelated: false, notSubscriptionReason: "one_time_purchase" },
      reviewed: true,
      note: "human said this is a one-time purchase",
    };

    const { entries, stats } = buildGoldenDraft(
      [input({ id: "e1" })], // fresh run now says it's a subscription
      [reviewed],
    );

    expect(entries[0]).toEqual(reviewed); // unchanged, human wins
    expect(stats).toMatchObject({ preservedReviewed: 1, refreshed: 0, added: 0 });
  });

  it("refreshes an unreviewed entry to the latest draft but keeps its note", () => {
    const stale: GoldenEntry = {
      id: "e1",
      from: "x",
      subject: "x",
      body: "x",
      outcome: "extracted",
      llmGuess: { isSubscriptionRelated: false },
      golden: { isSubscriptionRelated: false },
      reviewed: false,
      note: "need to double-check the amount",
    };

    const { entries, stats } = buildGoldenDraft([input({ id: "e1" })], [stale]);

    expect(entries[0].golden).toEqual(input().extraction); // refreshed
    expect(entries[0].note).toBe("need to double-check the amount"); // note survives
    expect(stats).toMatchObject({ refreshed: 1, preservedReviewed: 0, added: 0 });
  });
});
