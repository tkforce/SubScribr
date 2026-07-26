import { describe, it, expect } from "vitest";
import {
  AnalysisSchema,
  capInsights,
  sortInsightsByPriority,
  toAnalysisStreamEvent,
  type Insight,
} from "./analysis";

function insight(overrides: Partial<Insight> = {}): Insight {
  return {
    kind: "alert",
    priority: "medium",
    serviceName: "netflix",
    title: "標題",
    detail: "說明",
    ...overrides,
  };
}

describe("AnalysisSchema", () => {
  it("accepts a well-formed analysis", () => {
    const parsed = AnalysisSchema.safeParse({
      headline: "本月支出增加 NT$106。",
      insights: [
        {
          kind: "alert",
          priority: "high",
          serviceName: "netflix",
          title: "Netflix 漲價 60 元",
          detail: "標準方案從 330 漲到 390。",
          suggestion: "確認這個漲幅是否仍值得續訂。",
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an insight without a suggestion", () => {
    const parsed = AnalysisSchema.safeParse({
      headline: "本月無明顯變動。",
      insights: [insight({ kind: "change" })],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    const parsed = AnalysisSchema.safeParse({
      headline: "h",
      insights: [{ ...insight(), kind: "warning" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown priority", () => {
    const parsed = AnalysisSchema.safeParse({
      headline: "h",
      insights: [{ ...insight(), priority: "urgent" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects when headline is missing", () => {
    expect(AnalysisSchema.safeParse({ insights: [] }).success).toBe(false);
  });

  it("accepts an empty insight list", () => {
    const parsed = AnalysisSchema.safeParse({
      headline: "本月沒有值得注意的變動。",
      insights: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("no longer carries the separate observation / recommendations prose", () => {
    // Both were folded into the card list: cross-cutting patterns became
    // kind:"observation" cards, per-item advice became each card's suggestion.
    const parsed = AnalysisSchema.parse({
      headline: "h",
      insights: [],
      observation: "舊欄位",
      recommendations: ["舊欄位"],
    });
    expect(parsed).not.toHaveProperty("observation");
    expect(parsed).not.toHaveProperty("recommendations");
  });
});

describe("sortInsightsByPriority", () => {
  it("orders high → medium → low", () => {
    const sorted = sortInsightsByPriority([
      insight({ serviceName: "a", priority: "low" }),
      insight({ serviceName: "b", priority: "high" }),
      insight({ serviceName: "c", priority: "medium" }),
    ]);
    expect(sorted.map((i) => i.serviceName)).toEqual(["b", "c", "a"]);
  });

  it("is stable within the same priority", () => {
    const sorted = sortInsightsByPriority([
      insight({ serviceName: "a", priority: "high" }),
      insight({ serviceName: "b", priority: "high" }),
      insight({ serviceName: "c", priority: "high" }),
    ]);
    expect(sorted.map((i) => i.serviceName)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      insight({ serviceName: "a", priority: "low" }),
      insight({ serviceName: "b", priority: "high" }),
    ];
    sortInsightsByPriority(input);
    expect(input.map((i) => i.serviceName)).toEqual(["a", "b"]);
  });
});

describe("capInsights", () => {
  it("caps to 5 by default", () => {
    const many = Array.from({ length: 8 }, (_, n) =>
      insight({ serviceName: `svc${n}` }),
    );
    expect(capInsights(many).length).toBe(5);
  });

  it("keeps the highest-priority ones when capping", () => {
    const capped = capInsights(
      [
        insight({ serviceName: "low1", priority: "low" }),
        insight({ serviceName: "low2", priority: "low" }),
        insight({ serviceName: "high", priority: "high" }),
      ],
      2,
    );
    expect(capped.map((i) => i.serviceName)).toEqual(["high", "low1"]);
  });

  it("returns all when under the cap", () => {
    expect(capInsights([insight(), insight()], 5).length).toBe(2);
  });

  it("does not mutate the input array", () => {
    const input = [insight(), insight(), insight()];
    capInsights(input, 1);
    expect(input.length).toBe(3);
  });
});

describe("toAnalysisStreamEvent", () => {
  it("maps tool activity to progress events", () => {
    expect(
      toAnalysisStreamEvent({ type: "tool-call", toolName: "calculate_trend" }),
    ).toEqual({ type: "tool-call", toolName: "calculate_trend" });
  });

  it("returns null for chunk types we don't surface", () => {
    expect(toAnalysisStreamEvent({ type: "text-delta" })).toBeNull();
  });
});
