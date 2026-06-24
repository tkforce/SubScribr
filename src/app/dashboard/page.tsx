import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { getActiveSubscriptions, computeOverview } from "@/lib/subscriptions";
import { OverviewCard } from "./overview-card";
import { SubscriptionList } from "./subscription-list";
import { IngestButton } from "./ingest-button";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const subscriptions = session.userId
    ? await getActiveSubscriptions(session.userId)
    : [];
  const overview = computeOverview(subscriptions);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {session.user.email}
          </p>
        </div>
        <form action={signOutAction}>
          <Button variant="outline" type="submit">
            Sign out
          </Button>
        </form>
      </header>

      {session.error === "RefreshAccessTokenError" && (
        <p className="mb-6 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Your Gmail connection expired — please sign in again.
        </p>
      )}

      <OverviewCard
        totalMonthlyTwd={overview.totalMonthlyTwd}
        activeCount={overview.activeCount}
      />
      <SubscriptionList subscriptions={subscriptions} />
      <IngestButton />
    </main>
  );
}
