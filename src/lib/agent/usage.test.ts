import { describe, it, expect } from "vitest";
import { buildFlowUsage, buildStepBreakdown, tokensOf } from "./usage";

describe("tokensOf", () => {
  it("returns totalTokens when present", () => {
    expect(tokensOf({ totalTokens: 1234 })).toBe(1234);
  });

  it("returns 0 when totalTokens is undefined", () => {
    // AI SDK types usage.totalTokens as number | undefined.
    expect(tokensOf({})).toBe(0);
  });

  it("returns 0 when the usage object itself is undefined", () => {
    expect(tokensOf(undefined)).toBe(0);
  });
});

describe("buildStepBreakdown", () => {
  it("extracts tool names and tokens per step", () => {
    const steps = [
      { toolCalls: [{ toolName: "detect_anomalies" }], usage: { totalTokens: 500 } },
      {
        toolCalls: [{ toolName: "get_service_info" }, { toolName: "calculate_trend" }],
        usage: { totalTokens: 700 },
      },
      { toolCalls: [], usage: { totalTokens: 300 } },
    ];
    expect(buildStepBreakdown(steps)).toEqual([
      { toolNames: ["detect_anomalies"], tokens: 500 },
      { toolNames: ["get_service_info", "calculate_trend"], tokens: 700 },
      { toolNames: [], tokens: 300 },
    ]);
  });

  it("treats a missing totalTokens as 0", () => {
    const steps = [{ toolCalls: [], usage: {} }];
    expect(buildStepBreakdown(steps)).toEqual([{ toolNames: [], tokens: 0 }]);
  });
});

describe("buildFlowUsage", () => {
  it("sums the two phases and carries the step breakdown", () => {
    const stepBreakdown = [
      { toolNames: ["query_subscriptions"], tokens: 800 },
      { toolNames: [], tokens: 200 },
    ];
    expect(buildFlowUsage(1000, 200, stepBreakdown)).toEqual({
      phase1Tokens: 1000,
      phase2Tokens: 200,
      totalTokens: 1200,
      steps: 2,
      stepBreakdown,
    });
  });
});
