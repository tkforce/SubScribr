import { describe, it, expect } from "vitest";
import {
  isIngestStale,
  shouldRunIngest,
  formatLastSynced,
} from "./ingest-freshness";

// Threshold is 12h (AUTO_SYNC_THRESHOLD_HOURS). "now" fixed for determinism.
const now = new Date("2026-07-09T12:00:00Z");

describe("isIngestStale", () => {
  it("is stale when never synced (first-time user)", () => {
    expect(isIngestStale(null, now)).toBe(true);
  });

  it("is fresh right after a sync", () => {
    expect(isIngestStale(new Date("2026-07-09T11:59:00Z"), now)).toBe(false);
  });

  it("is fresh at exactly the threshold (must be strictly older)", () => {
    expect(isIngestStale(new Date("2026-07-09T00:00:00Z"), now)).toBe(false);
  });

  it("is stale when older than the threshold", () => {
    expect(isIngestStale(new Date("2026-07-08T23:59:59Z"), now)).toBe(true);
  });
});

describe("shouldRunIngest", () => {
  it("skips when fresh and not forced", () => {
    expect(shouldRunIngest(false, new Date("2026-07-09T11:00:00Z"), now)).toBe(
      false,
    );
  });

  it("runs when stale", () => {
    expect(shouldRunIngest(false, null, now)).toBe(true);
  });

  it("always runs when forced, even if fresh", () => {
    expect(shouldRunIngest(true, new Date("2026-07-09T11:59:00Z"), now)).toBe(
      true,
    );
  });
});

describe("formatLastSynced", () => {
  it("handles never-synced", () => {
    expect(formatLastSynced(null, now)).toBe("Not synced yet");
  });

  it("handles under a minute", () => {
    expect(formatLastSynced(new Date("2026-07-09T11:59:30Z"), now)).toBe(
      "Last synced just now",
    );
  });

  it("handles minutes", () => {
    expect(formatLastSynced(new Date("2026-07-09T11:55:00Z"), now)).toBe(
      "Last synced 5m ago",
    );
  });

  it("handles hours", () => {
    expect(formatLastSynced(new Date("2026-07-09T09:00:00Z"), now)).toBe(
      "Last synced 3h ago",
    );
  });

  it("handles days", () => {
    expect(formatLastSynced(new Date("2026-07-07T11:00:00Z"), now)).toBe(
      "Last synced 2d ago",
    );
  });
});
