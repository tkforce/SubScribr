import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { reconnectGmail, signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  getActiveSubscriptions,
  computeOverview,
  countAllSubscriptions,
} from "@/lib/queries/subscriptions";
import { computeMonthDelta, getMonthlyTrend } from "@/lib/queries/monthly-trend";
import { getAnalysisState } from "@/lib/queries/analysis";
import { isIngestStale, formatLastSynced } from "@/lib/ingest-freshness";
import { formatAnalyzedAt } from "@/lib/analysis-freshness";
import { StatRow } from "./stat-row";
import { SubscriptionList } from "./subscription-list";
import { TrendChart } from "./trend-chart";
import { AutoSync } from "./auto-sync";
import { AnalysisSection } from "./analysis-section";
import { FirstRunSync } from "./first-run-sync";
import { EmptyInbox } from "./empty-inbox";
import { SyncStatusProvider, SyncAware } from "./sync-status";
import { chooseDashboardView } from "@/lib/dashboard-view";
import {
  StatRowSkeleton,
  TrendChartSkeleton,
  SubscriptionListSkeleton,
} from "./skeletons";

// Server Actions inherit the invoking page's limit, and AutoSync triggers
// ingestSubscriptionEmails from here — a 90-day Gmail window fanned out at
// pMap concurrency 20, one LLM call per candidate email. A first-time sync is
// far more work than the ~36s analysis, so the same 60s ceiling applies; the
// page's own render is a few queries and nowhere near it.
export const maxDuration = 60;

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  // getAnalysisState also returns lastIngestAt, so it doubles as the user
  // freshness query the sync banner needs — one round-trip, not two.
  const [subscriptions, trendPoints, analysisState, subscriptionCount] =
    session.userId
      ? await Promise.all([
          getActiveSubscriptions(session.userId),
          getMonthlyTrend(session.userId),
          getAnalysisState(session.userId),
          countAllSubscriptions(session.userId),
        ])
      : [[], [], null, 0];
  const overview = computeOverview(subscriptions);

  const lastIngestAt = analysisState?.lastIngestAt ?? null;
  const now = new Date();

  const connectionExpired = session.error === "RefreshAccessTokenError";
  const stale = session.userId ? isIngestStale(lastIngestAt, now) : false;
  const lastSyncedLabel = formatLastSynced(lastIngestAt, now);

  // An expired Gmail connection can't sync, so it must reach the dashboard's
  // reconnect banner rather than a screen whose only action would fail.
  const view =
    session.userId && !connectionExpired
      ? chooseDashboardView({ lastIngestAt, subscriptionCount })
      : "dashboard";

  // Never synced: there is no dashboard to draw yet, only zeros the first sync
  // hasn't finished disproving. Show the sync itself instead, full-page. Once
  // it stamps lastIngestAt this branch is never taken again for this account.
  if (view === "first-run") return <FirstRunSync />;

  const isEmpty = subscriptions.length === 0;

  return (
    <SyncStatusProvider>
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          {/* Not "Dashboard": that names the furniture, not the content. With
              the sections below called Analysis and Subscriptions, the three
              read as one family, top to bottom. */}
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {session.user.email}
          </p>
          {/* The empty view owns its own scan button and freshness line, so a
              second one here would be two controls for one action. */}
          {view === "dashboard" && (
            <AutoSync
              stale={stale}
              lastSyncedLabel={lastSyncedLabel}
              connectionExpired={connectionExpired}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={signOutAction}>
            <Button variant="outline" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      {connectionExpired && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-md bg-destructive/10 px-3 py-2">
          <p className="text-xs text-destructive">
            Your Gmail connection expired — reconnect to resume syncing.
          </p>
          <form action={reconnectGmail}>
            <Button variant="outline" size="sm" type="submit">
              Reconnect Gmail
            </Button>
          </form>
        </div>
      )}

      {/* Nothing was found at all: a row of zeroed cards and an empty table is
          furniture arranged around nothing, so the body becomes the one thing
          worth saying and the one thing worth doing. The header stays — this
          state persists across visits, and it must not trap the user. */}
      {view === "empty" ? (
        <EmptyInbox
          stale={stale}
          lastSyncedLabel={lastSyncedLabel}
          connectionExpired={connectionExpired}
        />
      ) : (
      <>
      {/* Zeros are only worth showing once a sync has finished deciding they
          are the answer. While one is running with nothing on screen yet, the
          skeleton says "not known" where NT$ 0 would say "none". */}
      <SyncAware empty={isEmpty} fallback={<StatRowSkeleton />}>
        <StatRow
          totalMonthlyTwd={overview.totalMonthlyTwd}
          activeCount={overview.activeCount}
          delta={computeMonthDelta(trendPoints)}
        />
      </SyncAware>
      {/* Summary → interpretation → evidence. The analysis headline restates
          the stat row's delta in words, so the two reinforce each other when
          adjacent; separated by the chart and the table it just read as a
          repeat of something the user had already scrolled past. */}
      <AnalysisSection
        initial={analysisState?.stored?.analysis ?? null}
        freshnessLabel={formatAnalyzedAt(
          analysisState?.stored?.generatedAt ?? null,
          now,
        )}
        stale={analysisState?.stale ?? false}
        hasSubscriptions={subscriptions.length > 0}
      />
      <SyncAware empty={isEmpty} fallback={<TrendChartSkeleton />}>
        <TrendChart points={trendPoints} />
      </SyncAware>
      <SyncAware empty={isEmpty} fallback={<SubscriptionListSkeleton />}>
        <SubscriptionList subscriptions={subscriptions} now={now} />
      </SyncAware>
      </>
      )}
    </main>
    </SyncStatusProvider>
  );
}
