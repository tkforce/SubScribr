// Dev-only visual preview of dashboard components with mock data,
// for iterating on styling without a signed-in Gmail session.
import { notFound } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatRow } from "@/app/dashboard/stat-row";
import { TrendChart } from "@/app/dashboard/trend-chart";
import { SubscriptionList } from "@/app/dashboard/subscription-list";
import { AnalysisSection } from "@/app/dashboard/analysis-section";
import { SyncScreen } from "@/app/dashboard/sync-screen";
import {
  StatRowSkeleton,
  TrendChartSkeleton,
  SubscriptionListSkeleton,
} from "@/app/dashboard/skeletons";
import type { SubscriptionView } from "@/lib/queries/subscriptions";
import type { Analysis } from "@/lib/agent/analysis";

const MOCK_SUBS: SubscriptionView[] = [
  {
    id: "1",
    serviceName: "netflix",
    displayName: "Netflix",
    amount: 390,
    currency: "TWD",
    amountInTwd: 390,
    cycle: "monthly",
    category: "entertainment",
    status: "active",
    nextBillingDate: new Date(2026, 6, 15),
  },
  {
    id: "2",
    serviceName: "cursor",
    displayName: "Cursor Pro",
    amount: 20,
    currency: "USD",
    amountInTwd: 640,
    cycle: "monthly",
    category: "ai",
    status: "active",
    nextBillingDate: new Date(2026, 6, 12),
  },
  {
    id: "3",
    serviceName: "notion",
    displayName: "Notion",
    amount: 96,
    currency: "USD",
    amountInTwd: 3072,
    cycle: "yearly",
    category: "productivity",
    status: "active",
    nextBillingDate: new Date(2027, 1, 3),
  },
];

const MOCK_ANALYSIS: Analysis = {
  headline: "Spend is up NT$106 this month, about 9%; 4 things need attention.",
  insights: [
    {
      kind: "alert",
      priority: "high",
      serviceName: "Netflix",
      title: "Netflix may already be cancelled",
      detail: "No charge for three months, but it still shows as active.",
      suggestion:
        "Confirm on Netflix's site whether this is cancelled, so you stop being charged.",
    },
    {
      kind: "alert",
      priority: "medium",
      serviceName: "AI services",
      title: "Possibly overlapping AI subscriptions",
      detail:
        "You subscribe to both Cursor Pro (NT$640/mo) and Notion AI (NT$256/mo) — NT$896 a month together.",
      suggestion:
        "Consider whether you need both. Keeping one and cancelling Notion AI saves NT$256 a month.",
    },
    {
      kind: "change",
      priority: "low",
      serviceName: "Cursor Pro",
      title: "Cursor Pro is US$4 more expensive",
      detail:
        "The monthly fee went from US$20 to US$24 — about NT$1,536 more per year.",
    },
    {
      kind: "observation",
      priority: "low",
      serviceName: "AI subscriptions",
      title: "AI subscriptions doubled their share in three months",
      detail:
        "AI went from 1 subscription to 3, and from 24% to 52% of monthly spend — the biggest shift this month.",
    },
  ],
};

const MOCK_TREND = [
  { month: "2026-02", totalTwd: 980 },
  { month: "2026-03", totalTwd: 1230 },
  { month: "2026-04", totalTwd: 1230 },
  { month: "2026-05", totalTwd: 1480 },
  { month: "2026-06", totalTwd: 1180 },
  { month: "2026-07", totalTwd: 1286 },
];

function Divider({ label }: { label: string }) {
  return (
    <div className="mt-12 mb-4 flex items-center gap-3">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground/60">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export default function PreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">Preview (mock data)</p>
        </div>
        <ThemeToggle />
      </header>
      <StatRow
        totalMonthlyTwd={1286}
        activeCount={3}
        delta={{ deltaTwd: 106, pctChange: 106 / 1180 }}
      />
      <AnalysisSection
        initial={MOCK_ANALYSIS}
        freshnessLabel="Analyzed 2h ago"
        stale={false}
        hasSubscriptions
      />
      <TrendChart points={MOCK_TREND} />
      <SubscriptionList subscriptions={MOCK_SUBS} now={new Date()} />

      <Divider label="every subscription cancelled or hidden" />
      <SubscriptionList subscriptions={[]} now={new Date()} />

      <Divider label="syncing, nothing on screen yet" />
      <StatRowSkeleton />
      <TrendChartSkeleton />
      <SubscriptionListSkeleton />

      <Divider label="first sign-in: sync running" />
      <SyncScreen state={{ kind: "working", progress: "Reading email 128 of 312…" }} />

      <Divider label="first sign-in: extraction failed" />
      <SyncScreen
        state={{
          kind: "failed",
          message:
            "280 emails could not be read — probably temporary. Syncing again later will pick them up.",
        }}
        action={{ label: "Try again" }}
      />

      <Divider label="scanned, no subscription mail at all" />
      <SyncScreen
        state={{ kind: "empty", note: "Last synced: 3m ago" }}
        action={{ label: "Scan Gmail again" }}
      />

      <Divider label="nothing found: just pressed rescan" />
      <SyncScreen
        state={{
          kind: "empty",
          note: "Just scanned again — still no subscription billing emails.",
        }}
        action={{ label: "Scanning…", disabled: true }}
      />
    </main>
  );
}
