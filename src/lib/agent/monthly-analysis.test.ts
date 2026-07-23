import { describe, it, expect } from "vitest";
import {
  MonthlyAnalysisSchema,
  capTopChanges,
  type MonthlyChange,
} from "./monthly-analysis";

function change(n: number): MonthlyChange {
  return { serviceName: `svc${n}`, summary: `change ${n}` };
}

describe("MonthlyAnalysisSchema", () => {
  it("accepts a well-formed analysis", () => {
    const parsed = MonthlyAnalysisSchema.safeParse({
      topChanges: [{ serviceName: "netflix", summary: "漲價 60 元" }],
      observation: "本月整體支出上升。",
      recommendations: ["考慮取消閒置的服務"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects when observation is missing", () => {
    const parsed = MonthlyAnalysisSchema.safeParse({
      topChanges: [],
      recommendations: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts empty arrays with a narrative observation", () => {
    const parsed = MonthlyAnalysisSchema.safeParse({
      topChanges: [],
      observation: "本月沒有明顯變動。",
      recommendations: [],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("capTopChanges", () => {
  it("caps to the top 3 by default", () => {
    const capped = capTopChanges([
      change(1),
      change(2),
      change(3),
      change(4),
      change(5),
    ]);
    expect(capped.map((c) => c.serviceName)).toEqual(["svc1", "svc2", "svc3"]);
  });

  it("returns all when there are fewer than the cap", () => {
    expect(capTopChanges([change(1), change(2)]).length).toBe(2);
  });

  it("does not mutate the input array", () => {
    const input = [change(1), change(2), change(3), change(4)];
    capTopChanges(input);
    expect(input.length).toBe(4);
  });
});
