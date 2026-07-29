export type DashboardView = "first-run" | "empty" | "dashboard";

// Which of the three screens /dashboard is: the first sync, the "nothing was
// found" screen, or the dashboard proper.
//
// The empty case is keyed on billing events rather than on subscriptions
// because those are different kinds of empty. An account with billing mail
// that never recurs still has a trend chart and a history worth reading, so
// only an account with literally nothing gets the page taken over.
export function chooseDashboardView({
  lastIngestAt,
  billingEventCount,
}: {
  lastIngestAt: Date | null;
  billingEventCount: number;
}): DashboardView {
  // Checked first: before any sync every account's count is zero, so reading
  // the count first would declare "nothing found" before anything was sought.
  if (lastIngestAt === null) return "first-run";
  if (billingEventCount === 0) return "empty";
  return "dashboard";
}
