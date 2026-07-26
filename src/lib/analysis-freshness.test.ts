import { describe, it, expect } from "vitest";
import { formatAnalyzedAt } from "./analysis-freshness";

const NOW = new Date("2026-07-26T12:00:00Z");

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatAnalyzedAt", () => {
  it("says 尚未分析 when there is no analysis yet", () => {
    expect(formatAnalyzedAt(null, NOW)).toBe("尚未分析");
  });

  it("says 剛剛分析 for under a minute", () => {
    expect(formatAnalyzedAt(ago(30 * 1000), NOW)).toBe("剛剛分析");
  });

  it("counts minutes under an hour", () => {
    expect(formatAnalyzedAt(ago(5 * MINUTE), NOW)).toBe("5 分鐘前分析");
    expect(formatAnalyzedAt(ago(59 * MINUTE), NOW)).toBe("59 分鐘前分析");
  });

  it("counts hours under a day", () => {
    expect(formatAnalyzedAt(ago(2 * HOUR), NOW)).toBe("2 小時前分析");
    expect(formatAnalyzedAt(ago(23 * HOUR), NOW)).toBe("23 小時前分析");
  });

  it("counts days beyond that", () => {
    expect(formatAnalyzedAt(ago(3 * DAY), NOW)).toBe("3 天前分析");
  });

  it("treats a future timestamp as just now rather than negative", () => {
    expect(formatAnalyzedAt(new Date(NOW.getTime() + HOUR), NOW)).toBe(
      "剛剛分析",
    );
  });
});
