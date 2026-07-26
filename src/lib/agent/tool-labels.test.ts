import { describe, it, expect } from "vitest";
import { toolProgressLabel } from "./tool-labels";

describe("toolProgressLabel", () => {
  it("gives a zh-TW label for each known tool", () => {
    expect(toolProgressLabel("query_subscriptions")).toBe("查詢訂閱現況中...");
    expect(toolProgressLabel("calculate_trend")).toBe("計算花費趨勢中...");
    expect(toolProgressLabel("detect_anomalies")).toBe("偵測異常訂閱中...");
    expect(toolProgressLabel("get_service_info")).toBe("查詢服務定價資訊中...");
  });

  it("falls back to a generic label for an unknown tool", () => {
    expect(toolProgressLabel("something_new")).toBe("分析中...");
  });
});
