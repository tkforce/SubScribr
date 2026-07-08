# 月度支出趨勢圖（Coverage 攤平）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard 新增最近 6 個月的攤平月支出 bar chart，純 query-time 從 BillingEvent 推導，不落地、不加 migration。

**Architecture:** 每筆 `billing` event 依 cycle 覆蓋 N 個 calendar month（monthly=1 / quarterly=3 / yearly=12），每月貢獻 `amountInTwd / N`；純函式 `computeMonthlySpend` + 薄 I/O orchestrator `getMonthlyTrend`（沿用 `subscription-derive.ts` 的分層 pattern），server component 取數後交給 recharts client component 畫圖。

**Tech Stack:** TypeScript、Prisma（既有 `db`）、vitest、recharts（需新裝）、Next.js 16 App Router（`"use client"` 慣例與現有 `ingest-button.tsx` 相同）。

**Spec:** `docs/superpowers/specs/2026-07-07-monthly-trend-design.md`

---

## File Structure

| 檔案 | 動作 | 責任 |
| --- | --- | --- |
| `src/lib/monthly-trend.ts` | Create | `computeMonthlySpend`（pure）+ `getMonthlyTrend`（I/O orchestrator）+ types |
| `src/lib/monthly-trend.test.ts` | Create | 純函式單元測試（orchestrator 是薄 I/O，依現有 codebase 慣例不單測） |
| `src/app/dashboard/trend-chart.tsx` | Create | recharts bar chart client component，含 empty-state 自行 return null |
| `src/app/dashboard/page.tsx` | Modify | 取 trend 資料、在 OverviewCard 與 SubscriptionList 之間插入卡片 |
| `package.json` | Modify | 新增 recharts dependency |

關鍵語意（實作時容易漏的兩點，來自 spec）：

1. **Event 查詢下界 = 窗起點 − 12 個月**：11 個月前的年繳 event 覆蓋期會伸進 6 個月窗內，只查窗內 event 會漏算。
2. **只計 `emailSignalType === "billing"`**；`one-time` 與未知 cycle 貢獻 0。

---

### Task 1: `computeMonthlySpend` 純函式（TDD）

**Files:**
- Create: `src/lib/monthly-trend.ts`
- Test: `src/lib/monthly-trend.test.ts`

- [ ] **Step 1: 寫失敗測試**

建立 `src/lib/monthly-trend.test.ts`，內容如下（涵蓋 spec 測試清單全部案例）：

```typescript
import { describe, it, expect } from "vitest";
import { computeMonthlySpend, type TrendEvent } from "./monthly-trend";

// now 固定在 2026-07-15，6 個月窗 = 2026-02 .. 2026-07
const NOW = new Date(2026, 6, 15);

function ev(overrides: Partial<TrendEvent>): TrendEvent {
  return {
    amountInTwd: 100,
    cycle: "monthly",
    emailSignalType: "billing",
    emailReceivedAt: new Date(2026, 6, 1),
    ...overrides,
  };
}

describe("computeMonthlySpend", () => {
  it("returns monthsBack zeroed points for empty input", () => {
    const points = computeMonthlySpend([], 6, NOW);
    expect(points).toEqual([
      { month: "2026-02", totalTwd: 0 },
      { month: "2026-03", totalTwd: 0 },
      { month: "2026-04", totalTwd: 0 },
      { month: "2026-05", totalTwd: 0 },
      { month: "2026-06", totalTwd: 0 },
      { month: "2026-07", totalTwd: 0 },
    ]);
  });

  it("counts a monthly billing in its own calendar month only", () => {
    const points = computeMonthlySpend(
      [ev({ amountInTwd: 390, emailReceivedAt: new Date(2026, 4, 10) })],
      6,
      NOW,
    );
    expect(points.find((p) => p.month === "2026-05")?.totalTwd).toBe(390);
    expect(points.find((p) => p.month === "2026-04")?.totalTwd).toBe(0);
    expect(points.find((p) => p.month === "2026-06")?.totalTwd).toBe(0);
  });

  it("counts consecutive monthly billings in consecutive months", () => {
    const points = computeMonthlySpend(
      [
        ev({ amountInTwd: 390, emailReceivedAt: new Date(2026, 4, 10) }),
        ev({ amountInTwd: 390, emailReceivedAt: new Date(2026, 5, 10) }),
      ],
      6,
      NOW,
    );
    expect(points.find((p) => p.month === "2026-05")?.totalTwd).toBe(390);
    expect(points.find((p) => p.month === "2026-06")?.totalTwd).toBe(390);
  });

  it("amortizes a yearly billing across 12 months from its month", () => {
    const points = computeMonthlySpend(
      [
        ev({
          amountInTwd: 12000,
          cycle: "yearly",
          emailReceivedAt: new Date(2026, 2, 5), // 2026-03, covers 2026-03..2027-02
        }),
      ],
      6,
      NOW,
    );
    expect(points.find((p) => p.month === "2026-02")?.totalTwd).toBe(0);
    for (const m of ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]) {
      expect(points.find((p) => p.month === m)?.totalTwd).toBe(1000);
    }
  });

  it("includes coverage reaching into the window from an event before it", () => {
    // 2025-09 yearly event: covers 2025-09..2026-08 → every window month gets 1000
    const points = computeMonthlySpend(
      [
        ev({
          amountInTwd: 12000,
          cycle: "yearly",
          emailReceivedAt: new Date(2025, 8, 20),
        }),
      ],
      6,
      NOW,
    );
    for (const p of points) expect(p.totalTwd).toBe(1000);
  });

  it("amortizes a quarterly billing across 3 months", () => {
    const points = computeMonthlySpend(
      [
        ev({
          amountInTwd: 900,
          cycle: "quarterly",
          emailReceivedAt: new Date(2026, 3, 1), // 2026-04..2026-06
        }),
      ],
      6,
      NOW,
    );
    expect(points.find((p) => p.month === "2026-03")?.totalTwd).toBe(0);
    for (const m of ["2026-04", "2026-05", "2026-06"]) {
      expect(points.find((p) => p.month === m)?.totalTwd).toBe(300);
    }
    expect(points.find((p) => p.month === "2026-07")?.totalTwd).toBe(0);
  });

  it("keeps historical amounts after a price change", () => {
    // 漲價：5 月前 390、6 月起 490，各自覆蓋各自月份
    const points = computeMonthlySpend(
      [
        ev({ amountInTwd: 390, emailReceivedAt: new Date(2026, 4, 10) }),
        ev({ amountInTwd: 490, emailReceivedAt: new Date(2026, 5, 10) }),
      ],
      6,
      NOW,
    );
    expect(points.find((p) => p.month === "2026-05")?.totalTwd).toBe(390);
    expect(points.find((p) => p.month === "2026-06")?.totalTwd).toBe(490);
  });

  it("ignores non-billing signals", () => {
    const points = computeMonthlySpend(
      [
        ev({ emailSignalType: "renewal_notice" }),
        ev({ emailSignalType: "price_change" }),
        ev({ emailSignalType: "trial_reminder" }),
        ev({ emailSignalType: "cancellation" }),
        ev({ emailSignalType: "we_miss_you" }),
      ],
      6,
      NOW,
    );
    for (const p of points) expect(p.totalTwd).toBe(0);
  });

  it("ignores one-time and unknown cycles", () => {
    const points = computeMonthlySpend(
      [ev({ cycle: "one-time" }), ev({ cycle: "weekly" })],
      6,
      NOW,
    );
    for (const p of points) expect(p.totalTwd).toBe(0);
  });

  it("sums multiple services in the same month and rounds", () => {
    const points = computeMonthlySpend(
      [
        ev({ amountInTwd: 390, emailReceivedAt: new Date(2026, 6, 1) }),
        ev({
          amountInTwd: 1000,
          cycle: "yearly",
          emailReceivedAt: new Date(2026, 6, 2),
        }), // 1000/12 = 83.33…
      ],
      6,
      NOW,
    );
    expect(points.find((p) => p.month === "2026-07")?.totalTwd).toBe(473); // round(390 + 83.33)
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/monthly-trend.test.ts`
Expected: FAIL — `Cannot find module './monthly-trend'`（或等價的 module resolution error）

- [ ] **Step 3: 最小實作**

建立 `src/lib/monthly-trend.ts`：

```typescript
// ---------- Pure computation ----------

export type TrendEvent = {
  amountInTwd: number;
  cycle: string;
  emailSignalType: string;
  emailReceivedAt: Date;
};

export type MonthlyTrendPoint = {
  month: string; // "YYYY-MM"
  totalTwd: number;
};

// How many calendar months one billing event's charge covers.
// one-time and unknown cycles are not recurring spend — they contribute 0,
// same semantics as monthlyAmountTwd in subscriptions.ts.
const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

function monthKey(year: number, monthIndex: number): string {
  // normalize via Date so monthIndex may be out of [0,11]
  const d = new Date(year, monthIndex, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Amortized monthly spend: each billing event covers CYCLE_MONTHS[cycle]
// calendar months starting at its own month, contributing amount/N to each.
// Pure fold over events — no I/O. Callers must pass events whose coverage can
// reach the window, i.e. query from (window start − 12 months).
export function computeMonthlySpend(
  events: TrendEvent[],
  monthsBack: number,
  now: Date,
): MonthlyTrendPoint[] {
  const keys: string[] = [];
  const buckets = new Map<string, number>();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const key = monthKey(now.getFullYear(), now.getMonth() - i);
    keys.push(key);
    buckets.set(key, 0);
  }

  for (const e of events) {
    if (e.emailSignalType !== "billing") continue;
    const n = CYCLE_MONTHS[e.cycle];
    if (n === undefined) continue;
    const perMonth = e.amountInTwd / n;
    const y = e.emailReceivedAt.getFullYear();
    const m = e.emailReceivedAt.getMonth();
    for (let i = 0; i < n; i++) {
      const key = monthKey(y, m + i);
      const current = buckets.get(key);
      if (current !== undefined) buckets.set(key, current + perMonth);
    }
  }

  return keys.map((k) => ({
    month: k,
    totalTwd: Math.round(buckets.get(k) ?? 0),
  }));
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/monthly-trend.test.ts`
Expected: PASS（10 tests）

- [ ] **Step 5: 跑全部測試確認沒弄壞別的**

Run: `npm test`
Expected: 全綠

- [ ] **Step 6: Commit**

```bash
git add src/lib/monthly-trend.ts src/lib/monthly-trend.test.ts
git commit -m "feat: computeMonthlySpend — coverage-based amortized monthly spend

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `getMonthlyTrend` I/O orchestrator

**Files:**
- Modify: `src/lib/monthly-trend.ts`（檔案末尾追加）

薄 I/O 層，依 codebase 現有慣例（`subscription-derive.ts` 的 `upsertSubscriptionsForServices`、`subscriptions.ts` 的 `getActiveSubscriptions`）不寫單元測試。

- [ ] **Step 1: 實作 orchestrator**

在 `src/lib/monthly-trend.ts` 檔案**最上方**加 import：

```typescript
import { db } from "@/lib/db";
```

檔案末尾追加：

```typescript
// ---------- I/O orchestrator ----------

// Longest cycle is yearly: an event up to 12 months before the window start
// can still cover months inside the window, so the query bound reaches back
// windowStart − 12 months. Hidden subscriptions are excluded entirely;
// cancelled ones still count — their covered months were real spend.
export async function getMonthlyTrend(
  userId: string,
  monthsBack = 6,
  now: Date = new Date(),
): Promise<MonthlyTrendPoint[]> {
  const hidden = await db.subscription.findMany({
    where: { userId, status: "hidden" },
    select: { serviceName: true },
  });
  const hiddenNames = hidden.map((h) => h.serviceName);

  const queryStart = new Date(
    now.getFullYear(),
    now.getMonth() - (monthsBack - 1) - 12,
    1,
  );

  const rows = await db.billingEvent.findMany({
    where: {
      userId,
      emailSignalType: "billing",
      emailReceivedAt: { gte: queryStart },
      ...(hiddenNames.length > 0
        ? { serviceName: { notIn: hiddenNames } }
        : {}),
    },
    select: {
      amountInTwd: true,
      cycle: true,
      emailSignalType: true,
      emailReceivedAt: true,
    },
  });

  const events: TrendEvent[] = rows.map((r) => ({
    amountInTwd: Number(r.amountInTwd),
    cycle: r.cycle,
    emailSignalType: r.emailSignalType,
    emailReceivedAt: r.emailReceivedAt,
  }));

  return computeMonthlySpend(events, monthsBack, now);
}
```

- [ ] **Step 2: 型別檢查 + 測試**

Run: `npx tsc --noEmit && npm test`
Expected: 無型別錯誤、測試全綠

- [ ] **Step 3: Commit**

```bash
git add src/lib/monthly-trend.ts
git commit -m "feat: getMonthlyTrend orchestrator — query billing events and derive trend

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 安裝 recharts + TrendChart client component

**Files:**
- Modify: `package.json`（經由 npm install）
- Create: `src/app/dashboard/trend-chart.tsx`

- [ ] **Step 1: 安裝 recharts**

Run: `npm install recharts`
Expected: package.json dependencies 出現 `recharts`，install 無錯誤

- [ ] **Step 2: 建立 TrendChart component**

建立 `src/app/dashboard/trend-chart.tsx`。注意 `"use client"` 必須在檔案第一行（Next.js 16 慣例不變，同 `ingest-button.tsx`）。Empty state 規則來自 spec：沒有任何非零月份時整張卡隱藏。

```tsx
"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyTrendPoint } from "@/lib/monthly-trend";

export function TrendChart({ points }: { points: MonthlyTrendPoint[] }) {
  // Spec: hide the whole card when there is no countable billing spend at all.
  if (!points.some((p) => p.totalTwd > 0)) return null;

  const data = points.map((p) => ({
    ...p,
    label: `${Number(p.month.slice(5))}月`,
  }));

  return (
    <div className="mt-6 rounded-xl border bg-card/40 px-5 py-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        月支出趨勢（攤平）
      </div>
      <div className="mt-3 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.15} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={12}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={12}
              width={64}
              tickFormatter={(v: number) => v.toLocaleString()}
            />
            <Tooltip
              cursor={{ fillOpacity: 0.06 }}
              formatter={(value) => [
                `NT$ ${Math.round(Number(value)).toLocaleString()}`,
                "攤平支出",
              ]}
            />
            <Bar dataKey="totalTwd" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell
                  key={d.month}
                  fill="var(--primary)"
                  fillOpacity={i === data.length - 1 ? 0.9 : 0.3}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

（`var(--primary)` 在本專案 `globals.css` 是完整 oklch 色值，可直接作 fill；當月＝最後一根 bar 用高 opacity 標出，歷史月份低 opacity。）

- [ ] **Step 3: 型別檢查**

Run: `npx tsc --noEmit`
Expected: 無錯誤

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/app/dashboard/trend-chart.tsx
git commit -m "feat: TrendChart bar chart component (recharts)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 接進 dashboard page + 端到端驗證

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: 修改 page.tsx**

兩處修改。import 區（`src/app/dashboard/page.tsx:5-8`）加兩行：

```typescript
import { getMonthlyTrend } from "@/lib/monthly-trend";
import { TrendChart } from "./trend-chart";
```

資料取得處，現有：

```typescript
  const subscriptions = session.userId
    ? await getActiveSubscriptions(session.userId)
    : [];
  const overview = computeOverview(subscriptions);
```

改為（兩個查詢彼此獨立，平行取）：

```typescript
  const [subscriptions, trendPoints] = session.userId
    ? await Promise.all([
        getActiveSubscriptions(session.userId),
        getMonthlyTrend(session.userId),
      ])
    : [[], []];
  const overview = computeOverview(subscriptions);
```

JSX 中在 `<OverviewCard ... />` 與 `<SubscriptionList ... />` 之間插入：

```tsx
      <TrendChart points={trendPoints} />
```

- [ ] **Step 2: 型別檢查 + 全測試 + build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: 全部通過。build 若因環境變數（DB/auth secrets）失敗，記錄原因並確認失敗與本次改動無關即可。

- [ ] **Step 3: 本機視覺驗證**

啟動 dev server（有 launch config 就用 preview 工具，否則 `npm run dev`），登入後看 dashboard：

- 總覽卡下方出現「月支出趨勢（攤平）」卡，6 根 bar，最右（當月）高亮
- 當月 bar 的值 ≈ 總覽卡「本月總支出」（兩者同為攤平語意；若 DB 裡有年繳/季繳 event 但已超過 lastSeen，可能有合理差異——差異來源要能解釋）
- DB 無 billing event 的帳號：卡片整張不出現
- Tooltip 顯示 `NT$ x,xxx`

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: wire monthly spend trend chart into dashboard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review 紀錄

- **Spec coverage**：核心語意（billing-only、cycle 覆蓋、÷N、amountInTwd 不重換匯、hidden 排除/cancelled 照算、查詢下界 −12 月、固定 6 點含當月、四捨五入）→ Task 1/2；UI（bar chart、當月高亮、empty state 隱藏、位置）→ Task 3/4；spec 測試清單 10 案例全部出現在 Task 1 測試碼。
- **Placeholder scan**：無 TBD/TODO，所有 code step 附完整程式碼。
- **Type consistency**：`TrendEvent`/`MonthlyTrendPoint`/`computeMonthlySpend(events, monthsBack, now)`/`getMonthlyTrend(userId, monthsBack, now)` 在各 task 間簽名一致；`TrendChart` 的 props 用 Task 1 定義的 `MonthlyTrendPoint`。
