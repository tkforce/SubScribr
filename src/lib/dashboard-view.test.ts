import { describe, it, expect } from "vitest";
import { chooseDashboardView } from "./dashboard-view";

const synced = new Date("2026-07-29T05:23:00Z");

describe("chooseDashboardView", () => {
  it("runs the first sync when the account has never synced", () => {
    expect(
      chooseDashboardView({ lastIngestAt: null, billingEventCount: 0 }),
    ).toBe("first-run");
  });

  it("still runs the first sync when a stale count says zero", () => {
    // lastIngestAt wins: before any sync the count is zero for everyone, so
    // reading it first would send new accounts to the "nothing found" screen
    // before anything had been looked for.
    expect(
      chooseDashboardView({ lastIngestAt: null, billingEventCount: 0 }),
    ).toBe("first-run");
  });

  it("reports an empty inbox when a sync has run and found nothing at all", () => {
    expect(
      chooseDashboardView({ lastIngestAt: synced, billingEventCount: 0 }),
    ).toBe("empty");
  });

  it("shows the dashboard when billing mail exists but none of it recurs", () => {
    // The subscription list is empty here, but the trend chart and history are
    // not — taking the whole page over would hide real data.
    expect(
      chooseDashboardView({ lastIngestAt: synced, billingEventCount: 4 }),
    ).toBe("dashboard");
  });

  it("shows the dashboard once there is anything to show", () => {
    expect(
      chooseDashboardView({ lastIngestAt: synced, billingEventCount: 12 }),
    ).toBe("dashboard");
  });
});
