import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { reconnectGmail, signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getActiveSubscriptions, computeOverview } from "@/lib/subscriptions";
import { computeMonthDelta, getMonthlyTrend } from "@/lib/monthly-trend";
import { db } from "@/lib/db";
import { isIngestStale, formatLastSynced } from "@/lib/ingest-freshness";
import { StatRow } from "./stat-row";
import { SubscriptionList } from "./subscription-list";
import { TrendChart } from "./trend-chart";
import { AutoSync } from "./auto-sync";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const [subscriptions, trendPoints, user] = session.userId
    ? await Promise.all([
        getActiveSubscriptions(session.userId),
        getMonthlyTrend(session.userId),
        db.user.findUnique({
          where: { id: session.userId },
          select: { lastIngestAt: true },
        }),
      ])
    : [[], [], null];
  const overview = computeOverview(subscriptions);

  const lastIngestAt = user?.lastIngestAt ?? null;
  const now = new Date();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {session.user.email}
          </p>
          <AutoSync
            stale={session.userId ? isIngestStale(lastIngestAt, now) : false}
            lastSyncedLabel={formatLastSynced(lastIngestAt, now)}
          />
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

      {session.error === "RefreshAccessTokenError" && (
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

      <StatRow
        totalMonthlyTwd={overview.totalMonthlyTwd}
        activeCount={overview.activeCount}
        delta={computeMonthDelta(trendPoints)}
      />
      <TrendChart points={trendPoints} />
      <SubscriptionList subscriptions={subscriptions} now={now} />
    </main>
  );
}
