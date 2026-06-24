# Dashboard 訂閱清單 UI — 設計 spec

**日期**：2026-06-24
**狀態**：設計定稿，待實作
**對應 design 階段**：v7 F6（Dashboard Foundation）的早期切片，提前在 Week 4 做「呈現真實訂閱清單」的最小版本。

---

## 目標

`Subscription` table 已由 ingestion pipeline 寫入真實資料，但目前 `/dashboard` 還是個 dev 工具（抓 email / ingest / 下載），沒有任何 UI 讀 `Subscription`。本次做出第一版面向使用者的訂閱清單：上方一張總覽卡，下方依金額排序的訂閱列卡片。

## 範圍

**做**：

- 一張總覽卡：本月總支出（TWD，月正規化後加總）+ 有效訂閱數。
- 訂閱清單：C 版「橫向列卡片」，每筆一條，欄位對齊好掃讀。
- 只顯示 `status = "active"` 的訂閱，依「每月金額（TWD）」由高到低排序。
- 把現有 dev 工具搬到新的 `/dev` 頁；`/dashboard` 底部保留一個 Ingest 按鈕。

**明確不做**（後續 Week 9–10）：

- 編輯 / 隱藏訂閱
- filter / sort 的 UI 控制項
- 展開看 BillingEvent 歷史
- 月支出趨勢圖、分類 breakdown 圖
- AI 區塊（8a / 8b）
- 抓真實 logo（用字首 avatar 代替）

---

## 架構

`/dashboard` 改為 **server component**：用 `session.userId` 從 DB 撈訂閱、在 server 算好總覽再 render。清單無互動，不需 client component。唯一的 client 元件是底部的 Ingest 按鈕（需 `useTransition`）。

### 檔案異動

| 檔案 | 動作 |
|---|---|
| `src/app/dashboard/subscription-list.tsx` | **搬到** `src/app/dev/dev-tools.tsx`（內容不變，改名 export 為 `DevTools`） |
| `src/app/dev/page.tsx` | **新增**：auth guard（未登入 redirect `/`）+ render `<DevTools />` |
| `src/app/dashboard/page.tsx` | **改寫**：撈資料 → `<OverviewCard>` + `<SubscriptionList>` + 底部 `<IngestButton>` |
| `src/app/dashboard/subscription-list.tsx` | **新檔**（real list，server component，C 橫向列卡片） |
| `src/app/dashboard/overview-card.tsx` | **新增**：總覽卡（server component） |
| `src/app/dashboard/ingest-button.tsx` | **新增**：從舊元件抽出的 client 按鈕，沿用既有 `ingestSubscriptionEmails` action |
| `src/app/dashboard/avatar.tsx` | **新增**：字首 + hash 底色 avatar（server-renderable） |
| `src/lib/subscriptions.ts` | **新增**：`getActiveSubscriptions` + 純函式 `monthlyAmountTwd` / `computeOverview` |
| `src/lib/subscriptions.test.ts` | **新增**：純函式單元測試 |

> 註：`/dashboard/subscription-list.tsx` 同時是「被搬走的舊檔」與「新建的同名檔」。實作順序為先搬移舊檔到 `/dev/dev-tools.tsx`，再於原位置建立新的 server-component 清單。

---

## 資料邏輯（`src/lib/subscriptions.ts`）

`getActiveSubscriptions(userId)`：

```
db.subscription.findMany({ where: { userId, status: "active" } })
```

Prisma `Decimal` 欄位（`amount`、`amountInTwd`）轉成 `number` 後再交給純函式 / UI。

**純函式（好測，走 TDD）**：

- `monthlyAmountTwd(sub): number`
  - `cycle === "monthly"` → `amountInTwd`
  - `cycle === "yearly"` → `amountInTwd / 12`
  - `cycle === "quarterly"` → `amountInTwd / 3`
  - `cycle === "one-time"` → `0`（不計入經常性月支出）
  - 其他未知 cycle → `0`（防呆，不污染總額）

- `computeOverview(subs): { totalMonthlyTwd, activeCount }`
  - `totalMonthlyTwd` = `sum(monthlyAmountTwd)` 後四捨五入為整數
  - `activeCount` = `subs.length`

**排序**：清單依 `monthlyAmountTwd` 由高到低。

---

## UI 呈現

### 總覽卡（單張）

- 標題：本月總支出
- 主數字：`NT$ {totalMonthlyTwd.toLocaleString()}`
- 副文字：`{activeCount} 個有效訂閱`

### 訂閱列卡片（C 版）

每筆一橫條卡片（圓角、border、hover 變化），grid 欄位對齊：

| 欄位 | 內容 |
|---|---|
| Avatar | 字首（取 `displayName` 或 `serviceName` 首字）+ 依名字 hash 出的穩定底色 |
| 名稱 + 分類 | `displayName ?? serviceName`；下方分類 pill（中文 map） |
| 金額 | 原幣別原值（如 `US$ 20`）；幣別非 TWD 時下方補 `NT$ {amountInTwd}` 換算 |
| 週期 | 中文：月繳 / 年繳 / 季繳 / 一次性 |
| 下次扣款 | `nextBillingDate` 的 `M/D`，無則顯示 `—` |

- `isTrial === true` 時，名稱旁加一個「試用」badge。

### 中文對照 map

- **cycle**：`monthly→月繳`、`yearly→年繳`、`quarterly→季繳`、`one-time→一次性`
- **category**：`entertainment→娛樂`、`productivity→生產力`、`ai→AI`、`cloud→雲端`、`comm→通訊`、`other→其他`

### Avatar 底色

依名字字串 hash 取一組固定的調色盤其中一色，確保同一服務每次顏色一致。

---

## 狀態

- **Empty**（無 active 訂閱）：提示文字「目前沒有訂閱資料」+ 引導使用者按下方 Ingest 按鈕（或前往 `/dev` 重新掃描）。
- **Loading**：server component SSR 首屏即帶資料，無需 client loading；Ingest 按鈕自帶 pending 文字（「Ingesting…」）。
- **Error**：交給 Next.js error boundary，本次不特別處理。

---

## 測試

`src/lib/subscriptions.test.ts`：

- `monthlyAmountTwd`：四種 cycle 各一案（月 / 年÷12 / 季÷3 / 一次性=0）+ 未知 cycle = 0。
- `computeOverview`：
  - 混合 cycle 加總正確、one-time 被排除。
  - 年繳÷12 進總額。
  - 空清單 → `{ totalMonthlyTwd: 0, activeCount: 0 }`。
  - 四捨五入行為。

UI 不寫自動化測試，靠 `/dev` ingest 真實資料肉眼驗證。

---

## 開放問題

無。所有決定已於 brainstorming 對話中確認。
