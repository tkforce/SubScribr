# Dashboard 訂閱清單 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/dashboard` 呈現第一版面向使用者的訂閱清單（總覽卡 + 橫向列卡片），並把現有 dev 工具搬到新的 `/dev` 頁。

**Architecture:** `/dashboard` 改為 server component，用 `session.userId` 從 DB 撈 `status="active"` 訂閱，月支出正規化（年÷12、季÷3、一次性=0）由純函式算出，server 端排序與 render；唯一 client 元件是底部觸發 `ingestSubscriptionEmails` action 的 Ingest 按鈕。金額計算邏輯抽成純函式以 TDD 覆蓋。

**Tech Stack:** Next.js 16 App Router (server components)、TypeScript、Prisma、Vitest、Tailwind + shadcn/ui (`Badge`、`Button`)。

**Spec:** `docs/superpowers/specs/2026-06-24-dashboard-subscription-list-design.md`

---

## File Structure

| 檔案 | 責任 |
|---|---|
| `src/lib/subscriptions.ts` | DB 讀取 (`getActiveSubscriptions`) + 純函式 (`monthlyAmountTwd`、`computeOverview`) + `SubscriptionView` 型別 |
| `src/lib/subscriptions.test.ts` | 純函式單元測試 |
| `src/app/dev/dev-tools.tsx` | 由舊 `dashboard/subscription-list.tsx` 搬移；dev 工具（fetch / ingest / download / email dialog），export 改名 `DevTools` |
| `src/app/dev/page.tsx` | `/dev` 頁，auth guard + render `<DevTools />` |
| `src/app/dashboard/avatar.tsx` | 字首 + hash 底色 avatar（server-renderable） |
| `src/app/dashboard/overview-card.tsx` | 總覽卡（本月總支出 + 有效訂閱數） |
| `src/app/dashboard/subscription-list.tsx` | 新檔：訂閱列卡片清單（server component）+ cycle/category 中文 map + 金額/日期格式化 + empty state |
| `src/app/dashboard/ingest-button.tsx` | client 按鈕：呼叫 `ingestSubscriptionEmails` + `router.refresh()` |
| `src/app/dashboard/page.tsx` | 改寫：撈資料 → 總覽卡 + 清單 + Ingest 按鈕 |

每個 task commit 後 build 都應維持綠燈。

---

### Task 1: 金額純函式 + DB 讀取 (`src/lib/subscriptions.ts`)

**Files:**
- Create: `src/lib/subscriptions.ts`
- Test: `src/lib/subscriptions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/subscriptions.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { monthlyAmountTwd, computeOverview } from "./subscriptions";

describe("monthlyAmountTwd", () => {
  it("monthly returns amount as-is", () => {
    expect(monthlyAmountTwd({ cycle: "monthly", amountInTwd: 390 })).toBe(390);
  });
  it("yearly divides by 12", () => {
    expect(monthlyAmountTwd({ cycle: "yearly", amountInTwd: 1200 })).toBe(100);
  });
  it("quarterly divides by 3", () => {
    expect(monthlyAmountTwd({ cycle: "quarterly", amountInTwd: 300 })).toBe(100);
  });
  it("one-time is excluded (0)", () => {
    expect(monthlyAmountTwd({ cycle: "one-time", amountInTwd: 5000 })).toBe(0);
  });
  it("unknown cycle is 0", () => {
    expect(monthlyAmountTwd({ cycle: "weekly", amountInTwd: 100 })).toBe(0);
  });
});

describe("computeOverview", () => {
  it("empty list", () => {
    expect(computeOverview([])).toEqual({ totalMonthlyTwd: 0, activeCount: 0 });
  });
  it("sums monthly-normalized amounts and excludes one-time", () => {
    const subs = [
      { cycle: "monthly", amountInTwd: 390 },
      { cycle: "yearly", amountInTwd: 1200 }, // 100
      { cycle: "one-time", amountInTwd: 5000 }, // 0
    ];
    expect(computeOverview(subs)).toEqual({ totalMonthlyTwd: 490, activeCount: 3 });
  });
  it("rounds the total", () => {
    const subs = [{ cycle: "yearly", amountInTwd: 1000 }]; // 83.33
    expect(computeOverview(subs)).toEqual({ totalMonthlyTwd: 83, activeCount: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- subscriptions`
Expected: FAIL — `monthlyAmountTwd`/`computeOverview` not found (module `./subscriptions` does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/subscriptions.ts`:

```typescript
import { db } from "@/lib/db";

export type SubscriptionView = {
  id: string;
  serviceName: string;
  displayName: string | null;
  amount: number;
  currency: string;
  amountInTwd: number;
  cycle: string;
  category: string;
  status: string;
  nextBillingDate: Date | null;
  isTrial: boolean;
};

// Normalize any billing cycle to an equivalent monthly TWD figure.
// one-time and unknown cycles contribute 0 — they are not recurring spend.
export function monthlyAmountTwd(sub: {
  cycle: string;
  amountInTwd: number;
}): number {
  switch (sub.cycle) {
    case "monthly":
      return sub.amountInTwd;
    case "yearly":
      return sub.amountInTwd / 12;
    case "quarterly":
      return sub.amountInTwd / 3;
    default:
      return 0;
  }
}

export function computeOverview(
  subs: { cycle: string; amountInTwd: number }[],
): { totalMonthlyTwd: number; activeCount: number } {
  const total = subs.reduce((sum, s) => sum + monthlyAmountTwd(s), 0);
  return { totalMonthlyTwd: Math.round(total), activeCount: subs.length };
}

// Active subscriptions for a user, Decimal→number, sorted by monthly spend desc.
export async function getActiveSubscriptions(
  userId: string,
): Promise<SubscriptionView[]> {
  const rows = await db.subscription.findMany({
    where: { userId, status: "active" },
  });
  const subs: SubscriptionView[] = rows.map((r) => ({
    id: r.id,
    serviceName: r.serviceName,
    displayName: r.displayName,
    amount: Number(r.amount),
    currency: r.currency,
    amountInTwd: Number(r.amountInTwd),
    cycle: r.cycle,
    category: r.category,
    status: r.status,
    nextBillingDate: r.nextBillingDate,
    isTrial: r.isTrial,
  }));
  subs.sort((a, b) => monthlyAmountTwd(b) - monthlyAmountTwd(a));
  return subs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- subscriptions`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/subscriptions.ts src/lib/subscriptions.test.ts
git commit -m "feat: subscriptions data layer (monthly normalization + active query)"
```

---

### Task 2: 搬移 dev 工具到 `/dev`，瘦身 dashboard page

目標：把現有 dev 工具整組搬到 `/dev`，並暫時把 `dashboard/page.tsx` 收成只剩 header（後續 Task 7 再組回完整版），讓本 commit build 仍綠。

**Files:**
- Move: `src/app/dashboard/subscription-list.tsx` → `src/app/dev/dev-tools.tsx`
- Create: `src/app/dev/page.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: 搬移檔案**

Run:
```bash
git mv src/app/dashboard/subscription-list.tsx src/app/dev/dev-tools.tsx
```

- [ ] **Step 2: 改 export 名稱為 `DevTools`**

在 `src/app/dev/dev-tools.tsx`，把：
```typescript
export function SubscriptionList() {
```
改成：
```typescript
export function DevTools() {
```
（檔案其餘內容不動。）

- [ ] **Step 3: 建立 `/dev` 頁**

Create `src/app/dev/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DevTools } from "./dev-tools";

export default async function DevPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Dev Tools</h1>
      <DevTools />
    </main>
  );
}
```

- [ ] **Step 4: 瘦身 `dashboard/page.tsx`**

在 `src/app/dashboard/page.tsx`：

刪除這行 import：
```tsx
import { SubscriptionList } from "./subscription-list";
```

刪除 render 中的這行：
```tsx
      <SubscriptionList />
```

（其餘 header / sign-out / RefreshAccessTokenError 區塊保留不動。）

- [ ] **Step 5: 驗證 build**

Run: `npm run build`
Expected: 成功，無 type error（`/dashboard` 暫時只剩 header，`/dev` 顯示舊工具）。

- [ ] **Step 6: Commit**

```bash
git add src/app/dev/dev-tools.tsx src/app/dev/page.tsx src/app/dashboard/page.tsx
git commit -m "refactor: move dev tooling to /dev page"
```

---

### Task 3: Avatar 元件

**Files:**
- Create: `src/app/dashboard/avatar.tsx`

- [ ] **Step 1: 建立 avatar 元件**

Create `src/app/dashboard/avatar.tsx`:

```tsx
const AVATAR_COLORS = [
  "#E11D48",
  "#DB2777",
  "#9333EA",
  "#6366F1",
  "#2563EB",
  "#0891B2",
  "#059669",
  "#65A30D",
  "#CA8A04",
  "#EA580C",
];

export function avatarInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

// Stable color per name so the same service always renders the same swatch.
export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function Avatar({ name }: { name: string }) {
  return (
    <span
      className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-lg text-sm font-bold text-white"
      style={{ backgroundColor: avatarColor(name) }}
    >
      {avatarInitial(name)}
    </span>
  );
}
```

- [ ] **Step 2: 驗證 type check**

Run: `npx tsc --noEmit`
Expected: 無 error。

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/avatar.tsx
git commit -m "feat: subscription avatar (initial + hashed color)"
```

---

### Task 4: 總覽卡元件

**Files:**
- Create: `src/app/dashboard/overview-card.tsx`

- [ ] **Step 1: 建立總覽卡**

Create `src/app/dashboard/overview-card.tsx`:

```tsx
export function OverviewCard({
  totalMonthlyTwd,
  activeCount,
}: {
  totalMonthlyTwd: number;
  activeCount: number;
}) {
  return (
    <div className="rounded-xl border bg-card/40 px-5 py-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        本月總支出
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">
        NT$ {totalMonthlyTwd.toLocaleString()}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {activeCount} 個有效訂閱
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 驗證 type check**

Run: `npx tsc --noEmit`
Expected: 無 error。

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/overview-card.tsx
git commit -m "feat: dashboard overview card"
```

---

### Task 5: 訂閱列卡片清單元件

**Files:**
- Create: `src/app/dashboard/subscription-list.tsx`

- [ ] **Step 1: 建立清單元件**

Create `src/app/dashboard/subscription-list.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { Avatar } from "./avatar";
import type { SubscriptionView } from "@/lib/subscriptions";

const CYCLE_LABEL: Record<string, string> = {
  monthly: "月繳",
  yearly: "年繳",
  quarterly: "季繳",
  "one-time": "一次性",
};

const CATEGORY_LABEL: Record<string, string> = {
  entertainment: "娛樂",
  productivity: "生產力",
  ai: "AI",
  cloud: "雲端",
  comm: "通訊",
  other: "其他",
};

function formatAmount(currency: string, amount: number): string {
  if (currency === "TWD") return `NT$ ${Math.round(amount).toLocaleString()}`;
  const symbol =
    currency === "USD"
      ? "US$"
      : currency === "JPY"
        ? "¥"
        : currency === "EUR"
          ? "€"
          : `${currency} `;
  return `${symbol}${amount.toLocaleString()}`;
}

function formatNextBilling(d: Date | null): string {
  if (!d) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const GRID = "grid grid-cols-[34px_1.6fr_1fr_0.8fr_1fr] items-center gap-3.5";

export function SubscriptionList({
  subscriptions,
}: {
  subscriptions: SubscriptionView[];
}) {
  if (subscriptions.length === 0) {
    return (
      <p className="mt-8 rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        目前沒有訂閱資料。點下方的「Ingest」掃描 Gmail，或前往 /dev 重新掃描。
      </p>
    );
  }

  return (
    <div className="mt-6">
      <div
        className={`${GRID} px-3.5 pb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/60`}
      >
        <span />
        <span>服務</span>
        <span>金額</span>
        <span>週期</span>
        <span className="text-right">下次扣款</span>
      </div>
      <ul className="flex flex-col gap-2">
        {subscriptions.map((s) => {
          const name = s.displayName ?? s.serviceName;
          return (
            <li
              key={s.id}
              className={`${GRID} rounded-lg border bg-card/40 px-3.5 py-2.5 transition-colors hover:bg-muted/50`}
            >
              <Avatar name={name} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{name}</span>
                  {s.isTrial && <Badge variant="secondary">試用</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {CATEGORY_LABEL[s.category] ?? s.category}
                </span>
              </div>
              <div>
                <div className="text-sm font-semibold tabular-nums">
                  {formatAmount(s.currency, s.amount)}
                </div>
                {s.currency !== "TWD" && (
                  <div className="text-[11px] text-muted-foreground">
                    NT$ {Math.round(s.amountInTwd).toLocaleString()}
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {CYCLE_LABEL[s.cycle] ?? s.cycle}
              </span>
              <span className="text-right text-xs text-muted-foreground">
                {formatNextBilling(s.nextBillingDate)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: 驗證 type check**

Run: `npx tsc --noEmit`
Expected: 無 error。

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/subscription-list.tsx
git commit -m "feat: subscription list row-cards component"
```

---

### Task 6: Ingest 按鈕（client）

**Files:**
- Create: `src/app/dashboard/ingest-button.tsx`

- [ ] **Step 1: 建立按鈕元件**

Create `src/app/dashboard/ingest-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ingestSubscriptionEmails } from "@/app/actions/ingest";
import { Button } from "@/components/ui/button";
import type { IngestStats } from "@/lib/ingestion";

export function IngestButton() {
  const [isIngesting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<IngestStats | null>(null);
  const router = useRouter();

  const onIngest = () => {
    setError(null);
    setStats(null);
    startTransition(async () => {
      try {
        const result = await ingestSubscriptionEmails();
        setStats(result);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    });
  };

  return (
    <div className="mt-10 border-t pt-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onIngest} disabled={isIngesting}>
          {isIngesting ? "Ingesting…" : "Ingest 90d to DB"}
        </Button>
        {stats && (
          <span className="text-sm text-muted-foreground">
            ingested {stats.ingestedCount} · subscriptions{" "}
            {stats.subscriptionsUpserted}
          </span>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 驗證 type check**

Run: `npx tsc --noEmit`
Expected: 無 error（`IngestStats` 已 export 自 `src/lib/ingestion.ts`，含 `ingestedCount`、`subscriptionsUpserted`）。

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/ingest-button.tsx
git commit -m "feat: dashboard ingest button with refresh"
```

---

### Task 7: 組合 dashboard 頁

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: 改寫 page**

Replace the entire contents of `src/app/dashboard/page.tsx` with:

```tsx
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
```

- [ ] **Step 2: 驗證 build**

Run: `npm run build`
Expected: 成功，無 type error。

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: wire dashboard subscription list + overview + ingest"
```

---

### Task 8: 最終驗證

**Files:** （無，僅驗證）

- [ ] **Step 1: 全部測試**

Run: `npm test`
Expected: 全綠（含既有測試 + `subscriptions.test.ts`）。

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 無 error。

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 4: 手動驗證（dev server）**

Run: `npm run dev`，登入後：
- `/dashboard`：看到總覽卡（本月總支出）+ 訂閱列卡片（依金額由高到低），底部有 Ingest 按鈕；按 Ingest 後清單會 refresh。
- `/dev`：原 dev 工具（Fetch / Ingest / Download / email dialog）正常。
- 若帳號無 active 訂閱，`/dashboard` 顯示 empty state 文案。

---

## Self-Review

**Spec coverage：**
- 總覽卡（本月總支出 + 有效訂閱數）→ Task 4 + Task 1 (`computeOverview`) ✓
- C 橫向列卡片清單 → Task 5 ✓
- 只顯示 active、依每月金額排序 → Task 1 (`getActiveSubscriptions`) ✓
- 月支出正規化（年÷12/季÷3/一次性=0）→ Task 1 (`monthlyAmountTwd`) + 測試 ✓
- dev 工具搬到 `/dev`、dashboard 底部留 Ingest → Task 2 + Task 6 + Task 7 ✓
- 字首 avatar（無 logo）→ Task 3 ✓
- cycle/category 中文 map、非 TWD 補換算、isTrial badge → Task 5 ✓
- Empty / loading（Ingest pending）/ error（Next boundary）→ Task 5 (empty) + Task 6 (pending/error) ✓
- 純函式單元測試 → Task 1 ✓
- 明確不做（編輯/隱藏、filter UI、BillingEvent 歷史、趨勢圖、AI 區塊）→ 計畫未含 ✓

**Placeholder scan：** 無 TBD/TODO；每個 code step 都有完整程式碼。

**Type consistency：** `SubscriptionView`（Task 1）欄位與 Task 5 使用一致；`computeOverview` 回傳 `{ totalMonthlyTwd, activeCount }`（Task 1）對應 `OverviewCard` props（Task 4）與 page 傳值（Task 7）；`IngestStats` 的 `ingestedCount`/`subscriptionsUpserted` 對應既有 `src/lib/ingestion.ts` export。
