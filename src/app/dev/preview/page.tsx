// Dev-only visual preview of dashboard components with mock data,
// for iterating on styling without a signed-in Gmail session.
import { notFound } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatRow } from "@/app/dashboard/stat-row";
import { TrendChart } from "@/app/dashboard/trend-chart";
import { SubscriptionList } from "@/app/dashboard/subscription-list";
import type { SubscriptionView } from "@/lib/queries/subscriptions";

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
    isTrial: false,
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
    isTrial: false,
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
    isTrial: true,
  },
];

const MOCK_TREND = [
  { month: "2026-02", totalTwd: 980 },
  { month: "2026-03", totalTwd: 1230 },
  { month: "2026-04", totalTwd: 1230 },
  { month: "2026-05", totalTwd: 1480 },
  { month: "2026-06", totalTwd: 1180 },
  { month: "2026-07", totalTwd: 1286 },
];

export default function PreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Preview (mock data)</p>
        </div>
        <ThemeToggle />
      </header>
      <StatRow
        totalMonthlyTwd={1286}
        activeCount={3}
        delta={{ deltaTwd: 106, pctChange: 106 / 1180 }}
      />
      <TrendChart points={MOCK_TREND} />
      <SubscriptionList subscriptions={MOCK_SUBS} now={new Date()} />
    </main>
  );
}
