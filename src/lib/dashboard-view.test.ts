import { describe, it, expect } from "vitest";
import { chooseDashboardView } from "./dashboard-view";

const synced = new Date("2026-07-29T05:23:00Z");

describe("chooseDashboardView", () => {
  it("runs the first sync when the account has never synced", () => {
    // lastIngestAt wins over the counts: before any sync every account's
    // counts are zero, so reading them first would declare "nothing found"
    // before anything had been looked for.
    expect(
      chooseDashboardView({ lastIngestAt: null, subscriptionCount: 0 }),
    ).toBe("first-run");
  });

  it("reports an empty inbox when a sync has run and derived nothing", () => {
    expect(
      chooseDashboardView({ lastIngestAt: synced, subscriptionCount: 0 }),
    ).toBe("empty");
  });

  it("shows the dashboard once any subscription has been derived", () => {
    expect(
      chooseDashboardView({ lastIngestAt: synced, subscriptionCount: 1 }),
    ).toBe("dashboard");
  });

  it("counts cancelled and hidden subscriptions as something to show", () => {
    // The list filters to active, so this user sees an empty table — but the
    // trend chart still plots their past charges and the history is real.
    // Taking the page over here would hide data they have.
    expect(
      chooseDashboardView({
        lastIngestAt: synced,
        subscriptionCount: 3, // all cancelled
      }),
    ).toBe("dashboard");
  });
});
