export type DashboardView = "first-run" | "empty" | "dashboard";

// Which of the three screens /dashboard is: the first sync, the "nothing was
// found" screen, or the dashboard proper.
//
// `subscriptionCount` is every Subscription row, not just the active ones.
// Existing at all means deriveSubscriptionState found a concrete signal, which
// means there are real charges behind it — so a user whose subscriptions are
// all cancelled still gets the dashboard, where the trend chart plots the
// spending they used to have.
//
// The inverse case is why this is not keyed on billing events: a log made
// entirely of soft signals (trial_reminder, we_miss_you) produces rows but no
// subscription, and computeMonthlySpend skips every event that isn't `billing`
// — so that dashboard's chart is flat zero and its table is empty. Counting
// billing events would leave those users staring at furniture arranged around
// nothing, which is the thing this screen exists to prevent.
export function chooseDashboardView({
  lastIngestAt,
  subscriptionCount,
}: {
  lastIngestAt: Date | null;
  subscriptionCount: number;
}): DashboardView {
  // Checked first: before any sync every account's count is zero, so reading
  // the count first would declare "nothing found" before anything was sought.
  if (lastIngestAt === null) return "first-run";
  if (subscriptionCount === 0) return "empty";
  return "dashboard";
}
