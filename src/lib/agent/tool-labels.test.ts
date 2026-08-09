import { describe, it, expect } from "vitest";
import { toolProgressLabel } from "./tool-labels";

describe("toolProgressLabel", () => {
  it("gives a label for each known tool", () => {
    expect(toolProgressLabel("query_subscriptions")).toBe(
      "Reading your subscriptions…",
    );
    expect(toolProgressLabel("calculate_trend")).toBe(
      "Calculating spend trend…",
    );
    expect(toolProgressLabel("detect_anomalies")).toBe(
      "Scanning for anomalies…",
    );
    expect(toolProgressLabel("get_service_info")).toBe(
      "Looking up service pricing…",
    );
  });

  it("falls back to a generic label for an unknown tool", () => {
    expect(toolProgressLabel("something_new")).toBe("Analyzing…");
  });
});
