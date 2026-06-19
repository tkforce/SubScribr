import { describe, it, expect } from "vitest";
import { evaluate, type EvalPair } from "./eval";
import type { Extraction } from "./extraction";

function pair(id: string, golden: Extraction, predicted: Extraction | null): EvalPair {
  return { id, golden, predicted };
}

describe("evaluate — binary isSubscriptionRelated metrics", () => {
  it("computes the confusion matrix and precision/recall/F1", () => {
    const pairs = [
      pair("tp", { isSubscriptionRelated: true }, { isSubscriptionRelated: true }),
      pair("fp", { isSubscriptionRelated: false }, { isSubscriptionRelated: true }),
      pair("fn", { isSubscriptionRelated: true }, { isSubscriptionRelated: false }),
      pair("tn", { isSubscriptionRelated: false }, null), // null prediction = not detected
    ];

    const r = evaluate(pairs);

    expect(r.binary).toMatchObject({ tp: 1, fp: 1, fn: 1, tn: 1 });
    expect(r.binary.precision).toBeCloseTo(0.5);
    expect(r.binary.recall).toBeCloseTo(0.5);
    expect(r.binary.f1).toBeCloseTo(0.5);
    expect(r.binary.fpIds).toEqual(["fp"]);
    expect(r.binary.fnIds).toEqual(["fn"]);
  });

  it("returns 0 instead of NaN when there are no positives at all", () => {
    const r = evaluate([
      pair("tn", { isSubscriptionRelated: false }, { isSubscriptionRelated: false }),
    ]);
    expect(r.binary.precision).toBe(0);
    expect(r.binary.recall).toBe(0);
    expect(r.binary.f1).toBe(0);
  });
});

describe("evaluate — per-field accuracy", () => {
  it("scores over true-positive pairs, catching wrong values and hallucinated fields", () => {
    const pairs = [
      // amount match
      pair("a", { isSubscriptionRelated: true, amount: 390 }, { isSubscriptionRelated: true, amount: 390 }),
      // amount match; cycle hallucinated (golden has no cycle, prediction invents one)
      pair("b", { isSubscriptionRelated: true, amount: 200 }, { isSubscriptionRelated: true, amount: 200, cycle: "monthly" }),
      // amount wrong (8.8 vs 8)
      pair("c", { isSubscriptionRelated: true, amount: 8.8 }, { isSubscriptionRelated: true, amount: 8 }),
    ];

    const r = evaluate(pairs, ["amount", "cycle"]);

    const amount = r.fields.find((f) => f.field === "amount")!;
    expect(amount.total).toBe(3);
    expect(amount.correct).toBe(2);
    expect(amount.accuracy).toBeCloseTo(2 / 3);

    const cycle = r.fields.find((f) => f.field === "cycle")!;
    expect(cycle.asserted).toBe(0); // golden never asserts cycle here
    expect(cycle.correct).toBe(2); // a & c: absent == absent
    expect(cycle.mismatches).toEqual([{ id: "b", golden: undefined, predicted: "monthly" }]);
  });

  it("excludes false-negative entries from field scoring (detection vs extraction)", () => {
    const r = evaluate(
      [pair("fn", { isSubscriptionRelated: true, amount: 100 }, { isSubscriptionRelated: false })],
      ["amount"],
    );
    const amount = r.fields.find((f) => f.field === "amount")!;
    expect(amount.total).toBe(0); // no TP pairs → nothing to score
  });
});
