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
  it("says it has not analyzed yet when there is no analysis", () => {
    expect(formatAnalyzedAt(null, NOW)).toBe("Not analyzed yet");
  });

  it("says just now for under a minute", () => {
    expect(formatAnalyzedAt(ago(30 * 1000), NOW)).toBe("Analyzed just now");
  });

  it("counts minutes under an hour", () => {
    expect(formatAnalyzedAt(ago(5 * MINUTE), NOW)).toBe("Analyzed 5m ago");
    expect(formatAnalyzedAt(ago(59 * MINUTE), NOW)).toBe("Analyzed 59m ago");
  });

  it("counts hours under a day", () => {
    expect(formatAnalyzedAt(ago(2 * HOUR), NOW)).toBe("Analyzed 2h ago");
    expect(formatAnalyzedAt(ago(23 * HOUR), NOW)).toBe("Analyzed 23h ago");
  });

  it("counts days beyond that", () => {
    expect(formatAnalyzedAt(ago(3 * DAY), NOW)).toBe("Analyzed 3d ago");
  });

  it("treats a future timestamp as just now rather than negative", () => {
    expect(formatAnalyzedAt(new Date(NOW.getTime() + HOUR), NOW)).toBe(
      "Analyzed just now",
    );
  });
});
