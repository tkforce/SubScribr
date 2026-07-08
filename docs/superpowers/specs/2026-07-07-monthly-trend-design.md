# 月度支出趨勢圖（攤平制）— Design

Date: 2026-07-07
Status: Approved for planning

## 目標

在 dashboard 上回答「過去每個月我的訂閱支出是多少」。核心需求確認為 **aggregate 數字/趨勢**，不是重建某月的訂閱清單快照（as-of snapshot list 明確不在本次範圍）。

## 需求決策（brainstorming 結論）

| 決策點 | 結論 |
| --- | --- |
| 核心需求 | 每月支出數字/趨勢（不做當月訂閱清單重建） |
| 支出語意 | **攤平制（accrual）**：年繳 12,000 → 每月計 1,000。與現有總覽卡 `monthlyAmountTwd` 語意一致，趨勢圖最右點自然銜接總覽卡數字 |
| 計算方式 | **Coverage 攤平**（做法 1）：每筆 billing event 覆蓋一個週期的 calendar months，貢獻 = 金額 ÷ 覆蓋月數 |
| 資料落地 | 不落地。純 query-time derivation，不加 table、不加 migration、不動 ingestion |

### 為什麼是 Coverage 攤平（而非 as-of replay 或 snapshot table）

- **Lapse 問題自動消失**：訂閱停止 → 沒有新 billing event → 覆蓋期一過自然從曲線消失。不需要發明「幾天沒信算死掉」的規則（as-of replay 做法必須發明，且最難驗證）。
- **歷史金額天然正確**：漲價前的 event 帶著舊價格，各自覆蓋各自期間。用當前 Subscription 表回推會把新價格套到過去。
- **符合 v7 哲學**：state should be derivable。BillingEvent 是 source of truth，derive 邏輯改了重算即修復。
- Snapshot table 需要 cron（在專案「明確不做」清單上）且違反 derivable 原則；資料量（單 user、幾百筆 event）也完全不需要預算 aggregate。

### 歷史累積的前提（重要澄清）

BillingEvent 一旦 ingest 即永久保存；`INGEST_WINDOW_DAYS = 90` 只限制**初次回掃**能掃多遠，不限制歷史累積。用滿一年自然有 12 個月的 event。因此本功能不需要任何「保留歷史」機制。

## 架構與資料流

```
dashboard page (server component)
  → getMonthlyTrend(userId)                    // src/lib/monthly-trend.ts（I/O orchestrator）
      1. 查 hidden 訂閱的 serviceName set（過濾用）
      2. 查該 user 的 BillingEvent（billing signal、非 hidden service、時間下界見下）
      3. computeMonthlySpend(events, 6, now)   // 純函式，無 I/O
  → <TrendChart points={...} />                // client component, recharts
```

分層沿用 `subscription-derive.ts` 的「pure function + 薄 I/O orchestrator」pattern。

### Event 查詢時間下界 ⚠️

**不能只查最近 6 個月的 event**：11 個月前的年繳 event 覆蓋期會伸進 6 個月窗內。查詢下界 = `窗起點 − 12 個月`（最長 cycle = yearly）。

## 核心語意：`computeMonthlySpend(events, monthsBack, now)`

- **只計 `emailSignalType === "billing"`**。`renewal_notice` / `price_change` 是通知非扣款，計入會重複計費。
- 每筆 event 依 cycle 覆蓋 N 個 calendar month（自 event 所在月起算）：
  - `monthly` → 1
  - `quarterly` → 3
  - `yearly` → 12
  - `one-time` → 不計（與現有 `monthlyAmountTwd` 一致）
  - 未知 cycle → 不計
- 每個覆蓋月貢獻 = `amountInTwd / N`。
- 金額一律用 event 上已落地的 `amountInTwd`，不重新換匯（歷史匯率 = 當時存的值）。
- 輸出固定 `monthsBack` 個點（含進行中的當月）：`[{ month: "2026-02", totalTwd: number }]`，`totalTwd` 四捨五入為整數。
- `hidden` 訂閱的 event 整條排除（orchestrator 層過濾）；`cancelled` 照算 — 活著時是真實支出。

## 已知限制（刻意接受，不處理）

1. **Calendar month bucket 抖動**：月繳在 1/1 與 1/31 各一筆 → 1 月計兩筆、2 月為 0。按日 prorate 可解但複雜度不值。
2. **同一筆扣款寄兩封信**（收據＋發票，不同 `gmailMessageId`）會重複計算。等真實資料出現再處理。
3. **初次註冊的年繳盲區**：90 天回掃掃不到 10 個月前的年繳收據，該服務要等下次扣款才進曲線。資料邊界，無解。
4. **只寄 renewal_notice 不寄收據的服務**會漏掉。等真實資料說話。
5. **無分類 breakdown**：BillingEvent 沒有 `category` 欄位，v1 只畫總額單序列。F6 的分類 pie（讀當前 Subscription）是另一功能，不在本次範圍。
6. **沒資料的月份畫 0**，不做「資料從 X 月開始」標註。

## UI

- 位置：dashboard 總覽卡與訂閱列表之間，新增一張趨勢卡。
- recharts **bar chart**：6 根 bar、Y 軸 TWD、tooltip 顯示該月金額、當月 bar 用主色標出。
  - 選 bar 不選 line：攤平月支出是離散量，月與月之間非連續。
- Empty state：完全沒有可計入的 billing event 時整張卡隱藏（不畫六根 0）。

## 檔案

| 檔案 | 內容 |
| --- | --- |
| `src/lib/monthly-trend.ts` | `computeMonthlySpend`（pure）+ `getMonthlyTrend`（orchestrator） |
| `src/lib/monthly-trend.test.ts` | 純函式單元測試（vitest） |
| `src/app/dashboard/trend-chart.tsx` | client component（recharts） |
| `src/app/dashboard/page.tsx` | 插入趨勢卡 |

## 測試（純函式餵合成 event）

- 月繳單筆 / 連續多月
- 年繳攤 12 個月；覆蓋期跨出 6 個月窗的裁切
- 季繳攤 3 個月
- 漲價：同服務兩筆不同金額 event，各自覆蓋各自期間
- `renewal_notice` / `price_change` / `one-time` / 未知 cycle 不計入
- 空 input → 空結果；多服務同月加總
- 窗外 event 的覆蓋期伸進窗內 → 要算（驗證查詢下界語意）

## 不在範圍（本次明確不做）

- 某月訂閱清單的 as-of 重建（含 lapse 判定規則）
- MonthlySnapshot 落地表 / cron
- 分類堆疊 / breakdown
- cash（實際扣款）視角的第二條線
