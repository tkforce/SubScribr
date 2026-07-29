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
  headline: "本月支出增加 NT$106，增幅約 9%；有 4 件事需要注意。",
  insights: [
    {
      kind: "alert",
      priority: "high",
      serviceName: "Netflix",
      title: "Netflix 可能已在外部取消",
      detail: "已 3 個月沒有扣款紀錄，但狀態仍顯示使用中。",
      suggestion:
        "到 Netflix 官網確認這筆訂閱是否已經取消，避免帳戶持續被扣款。",
    },
    {
      kind: "alert",
      priority: "medium",
      serviceName: "AI 服務",
      title: "疑似重複訂閱 AI 服務",
      detail:
        "您同時訂閱「Cursor Pro」（每月 NT$640）與「Notion AI」（每月 NT$256），合計每月 NT$896。",
      suggestion:
        "考量您是否確實需要同時訂閱這兩項服務。若只保留其一，取消 Notion AI 可省下每月 NT$256。",
    },
    {
      kind: "change",
      priority: "low",
      serviceName: "Cursor Pro",
      title: "Cursor Pro 漲價 US$4",
      detail: "月費從 US$20 調整為 US$24，年化增加約 NT$1,536。",
    },
    {
      kind: "observation",
      priority: "low",
      serviceName: "AI 類訂閱",
      title: "AI 類訂閱佔比三個月內翻倍",
      detail:
        "AI 類訂閱從 1 個增加到 3 個，佔月支出從 24% 上升到 52%，是本月支出結構最大的變化。",
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
      <AnalysisSection
        initial={MOCK_ANALYSIS}
        freshnessLabel="2 小時前分析"
        stale={false}
        hasSubscriptions
      />
      <TrendChart points={MOCK_TREND} />
      <SubscriptionList
        subscriptions={MOCK_SUBS}
        now={new Date()}
        billingEventCount={MOCK_SUBS.length}
      />

      <Divider label="空狀態：掃描過但沒有訂閱" />
      <SubscriptionList
        subscriptions={[]}
        now={new Date()}
        billingEventCount={4}
      />

      <Divider label="空狀態：完全沒有帳單信件" />
      <SubscriptionList subscriptions={[]} now={new Date()} billingEventCount={0} />

      <Divider label="同步中（無既有資料）" />
      <StatRowSkeleton />
      <TrendChartSkeleton />
      <SubscriptionListSkeleton />

      <Divider label="首次登入：同步進行中" />
      <SyncScreen state={{ kind: "working", progress: "AI 判讀中⋯128 / 312" }} />

      <Divider label="首次登入：判讀失敗" />
      <SyncScreen
        state={{
          kind: "failed",
          message: "280 封信件判讀失敗，可能是暫時性問題，稍後重新同步即可。",
        }}
        action={{ label: "重新嘗試" }}
      />

      <Divider label="掃描過但完全沒有訂閱信件" />
      <SyncScreen
        state={{ kind: "empty", note: "Last synced: 3m ago" }}
        action={{ label: "重新掃描 Gmail" }}
      />

      <Divider label="沒有訂閱：剛按過重新掃描" />
      <SyncScreen
        state={{
          kind: "empty",
          note: "剛剛重新掃描過，仍然沒有找到訂閱帳單信件。",
        }}
        action={{ label: "掃描中⋯", disabled: true }}
      />
    </main>
  );
}
