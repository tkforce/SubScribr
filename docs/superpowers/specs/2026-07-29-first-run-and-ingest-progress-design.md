# 首次登入體驗、Ingest SSE 進度、零結果狀態 — Design Spec

日期：2026-07-29
狀態：已與使用者確認方向與設計

## 背景與問題

用另一個 Gmail 帳號首次登入後，dashboard 長這樣：`NT$ 0`、`0 個服務`、「目前沒有訂閱資料」、「尚無訂閱資料可供分析」，右上角一行小小的 `Last synced: just now`。看起來像什麼都沒發生，按 refresh 也沒有變化。

實際查證（唯讀查 DB + 對 Gemini 做健康檢查）的結果：

| 觀察 | 數值 |
| ---- | ---- |
| `createdAt` → `lastIngestAt` | 05:22:12 → 05:23:08，**相隔 56 秒** |
| `billingEvents` / `subscriptions` | 0 / 0 |
| Gemini 單次呼叫 | 2.3 秒，成功 |
| Gemini 40 封 @ concurrency 20 | 40/40 成功，6.6 秒 |

56 秒不是「查無信件」（那會在一秒內回來），而是**幾百封信真的跑完了 LLM 判讀**。用實測速率回推約 300 封上下。後續在 `/dev` 手動 ingest 確認：這個帳號的候選信件確實都不是定期訂閱，`0` 是**正確答案**。

所以這不是 bug，而是三個沒有處理的狀態：

1. **成功執行與從未執行長得一樣。** ingest 與 analyze 的自動觸發鏈路都是通的（`lastIngestAt === null` → `isIngestStale` → `AutoSync` 觸發；ingest 完 `router.refresh()` → `hasSubscriptions` 轉 true → `AnalysisSection` 接上），但畫面完全反映不出來。
2. **首次同步期間的畫面在說謊。** 還在掃描時就顯示 `NT$ 0`、「目前沒有訂閱資料」——那不是過期的事實，是尚未成立的結論，而且和旁邊的 spinner 互相矛盾。
3. **零結果狀態無法證偽。** `IngestStats` 在 `ingestEmails()` 內算得好好的，跨過 server action 邊界，然後被 `AutoSync` 直接丟棄（`auto-sync.tsx:42` 只 `await`，沒接回傳值）。於是「你沒有訂閱」、「300 封信全是一次性消費」、「LLM 全部判讀失敗」三種結局**渲染出同一個畫面**——其中第三種是真的故障。這正是這次得靠查 DB 才能定位的原因。

`2026-07-09-auto-sync-design.md` §5 當時就把這塊圈起來延後了（「streaming progress 是之後 SSE 的範圍，不在本 spec」）。本 spec 收尾它。

## 已排除的替代方案

- **首次 loading 的結束條件設為「有訂閱資料」**：這個帳號證明了「同步完成」與「有資料」不是同一件事，0 筆是合法終局，這樣寫會永遠轉圈。條件必須是**同步完成**。
- **全部同步都改成骨架**：會把回訪使用者已有的真實數字藏起來。舊數字只是**舊**，不是錯（design v8 對訂閱列表與分析 headline 的區別已有論證）。
- **分段假進度（前端定時換文案）**：信箱大小差異極大，慢帳號會看到進度卡在最後一段不動，實質上是說謊。
- **零結果不揭露數字**：等於保留現在這個無法證偽的空狀態。

## 設計

### 1. 狀態機與畫面歸屬

判斷鍵用既有的 `lastIngestAt`，沿用專案已經用過兩次的「server 判斷、client 完成」模式：

```
lastIngestAt === null  → 整頁 <FirstRunSync />（不渲染 dashboard 本體）
lastIngestAt !== null  → 正常 dashboard（現有 AutoSync 路徑）
```

`FirstRunSync` 完成後呼叫 `router.refresh()`：`lastIngestAt` 此時已寫入，同一次導覽內直接轉為正常 dashboard。不需要新路由、不需要 callback 串接、不需要新的 DB 欄位。

整頁畫面只在帳號生命週期出現一次。

### 2. `/api/ingest`：SSE 化

`src/lib/sse.ts` 的 `createSseResponse<T>` 與 `src/lib/sse-client.ts` 的 `readSseStream<T>` 已是泛型，直接沿用，不需要新的傳輸層。

```ts
type IngestEvent =
  | { type: "progress"; message: string }  // 文案在 server 端組好
  | { type: "done"; stats: IngestStats }
  | { type: "error"; message: string };
```

`ingestEmails(accessToken, userId, days, onEvent?)` 多一個 optional callback，在四個既有接縫發事件：

| 接縫 | 事件文案 |
| ---- | -------- |
| `listMessageIds` 回來 | 「Gmail 篩選⋯找到 N 封候選」 |
| `fetchMessagesByIds` 回來 | 「讀取信件內容⋯N 封」 |
| pMap 每完成一封 | 「AI 判讀中⋯ M / N」 |
| derive 完成 | 「整理訂閱資料⋯N 個服務」 |

每封完成就送一幀（約 300 幀小訊息，成本可忽略），計數器包在 mapper 外層即可，`pMap` 的 concurrency 不變。**onEvent 為 optional，不傳時行為與現在完全相同**，所以這是純新增。

route 本身鏡像 `/api/analyze`：session 取 `userId`（絕不從 request body 拿）、server 端再檢查一次新鮮度擋多分頁重複觸發、`force` 從 body 讀。

### 3. 單一 ingest 路徑

`/api/ingest` 成為唯一入口，`src/app/actions/ingest.ts` 刪除。改用它的三個呼叫點：

- `FirstRunSync`（新）
- `AutoSync`（header 的自動同步與 refresh 按鈕）——順便讓「Syncing…」升級成真實進度文字
- `/dev` 的 `DevTools`——stats 改從 `done` 事件取，顯示不變

理由：同一個操作留兩條實作遲早分岔。既有的 server-side 新鮮度 re-check 與 `gmailMessageId` dedupe 兩道防線都在 route 裡保留。

### 4. 骨架規則

```
同步中 && subscriptions.length === 0  → 骨架
同步中 && 有資料                       → 維持 stale-while-revalidate（現狀不動）
```

骨架取代的是**假的零**，不是**舊的真數字**。適用於 `StatRow`、`TrendChart`、`SubscriptionList`，形狀沿用 `AnalysisSkeleton` 已經在用的做法（高度貼近真實內容，避免結果進來時頁面跳動）。

**同步狀態如何傳到這三個元件**：`StatRow` 與 `SubscriptionList` 目前是 server component，而「同步中」只有 client 知道（`AutoSync` 持有）。不把它們改成 client component——改用 context + children 傳遞：

```tsx
<SyncProvider>            {/* client，持有 isSyncing */}
  <AutoSync … />
  <SyncAware empty={subscriptions.length === 0} fallback={<StatRowSkeleton />}>
    <StatRow … />         {/* 仍由 server 渲染，當作 children 傳入 */}
  </SyncAware>
  …
</SyncProvider>
```

`SyncAware` 是 client component，`isSyncing && empty` 時渲染 `fallback`，否則渲染 `children`。`empty` 在 server render 時就已知，當 prop 傳入。這樣三個元件的 server/client 邊界都不動。

這條規則涵蓋的是首次之後的復發情境：首次同步得到 0 筆的帳號，`lastIngestAt` 已寫入，隔天回訪超過 12 小時 → stale → 背景同步 56 秒，這段期間走的是一般 dashboard，沒有骨架就會再看到一次 `NT$ 0` + spinner。

### 5. 零結果文案：`describeIngestOutcome(stats)`

純函式決定語氣與文案，UI 只負責渲染。判斷優先序（**失敗優先於空**）：

| 條件 | 語氣 | 文案 |
| ---- | ---- | ---- |
| `extractFailedCount > 0` | 警告 | 「N 封信判讀失敗，可能是暫時性問題。」＋重試 |
| `candidateCount === 0` | 中性 | 「過去 90 天沒有找到帳單類信件。」 |
| `ingestedCount === 0` | 中性 | 「掃描了 N 封帳單類信件，都不是定期訂閱。」 |

`extractFailedCount > 0` 必須先判：把它折疊進「沒有訂閱」等於把故障偽裝成空狀態。

同時修掉 `subscription-list.tsx:75` 現有文案——它寫「點下方的『Ingest』掃描 Gmail，或前往 /dev 重新掃描」，但 dashboard 上沒有 Ingest 按鈕，而 `/dev` 是開發頁面不該出現在使用者面前。改為指向 header 既有的 refresh 按鈕，不新增按鈕。

### 6. 錯誤處理

- SSE 送 `error` → `FirstRunSync` 顯示錯誤 + 重試按鈕，不會卡在轉圈。
- **修既有缺陷**：`useAnalysisStream` 在「stream 結束但沒收到 `done`」時，status 會永遠停在 `streaming`。這正是 function timeout 的樣子（`/api/analyze/route.ts` 的註解已描述此失敗模式但未處理）。迴圈結束後若 status 仍是 `streaming` → 轉 `error`。
- hook 現在同時服務 ingest 與 analysis，`use-analysis-stream.ts` 更名為 `use-event-stream.ts`、`useAnalysisStream` → `useEventStream`。它本來就是泛型的，只有名字綁死在 analysis。
- `RefreshAccessTokenError` 沿用現有 banner 與 `connectionExpired` 行為。

### 7. 測試

- `describeIngestOutcome` 純函式單測：三個分支 + 失敗優先於空的優先序。
- `pipeline.ingest-emails.test.ts` 補一則斷言：`onEvent` 收到的事件序列與計數正確；另補一則不傳 `onEvent` 時行為不變。
- `use-event-stream` 的「stream 結束無 `done` → error」。
- `sse.ts` / `sse-client.ts` 既有測試不動。

## 已知風險（不在本 spec 解決）

**`maxDuration` 已經貼在牆上。** 首次同步實測 56 秒，Vercel Hobby 的上限就是 60。這次只差 4 秒過關，信箱再大一點就會 504——而且 `lastIngestAt` 是在 `ingestEmails()` 最後才戳，逾時等於整批白跑，下次進來再跑一次全量、再逾時一次，形成無法脫離的迴圈。

本 spec 不解決它（真正的解法是分批 ingest 或縮短首次視窗，屬獨立範圍），但 SSE 化之後至少**看得見它死在哪一段**，而不是像現在一樣靜默。列為 Week 11 部署前必須處理的項目。

## 明確不做

- 分批 / 可續跑的 ingest（上述風險的真正解法，獨立範圍）
- 首次同步的視窗長度調整
- 手動「重新分析」入口（design v8 已決定不做）
- 零結果狀態的引導式教學或範例資料
