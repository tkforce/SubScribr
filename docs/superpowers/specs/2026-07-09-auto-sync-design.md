# Auto-Sync（Stale-while-revalidate 自動同步）— Design Spec

日期：2026-07-09
狀態：已與使用者確認方向與設計

## 背景與問題

目前 ingestion 只能靠 dashboard 上的 `Ingest 90d to DB` 按鈕手動觸發。登入後看到的是上次手動 ingest 的舊資料，且畫面上沒有任何「這份資料多舊」的資訊。理想 UX 是：資料在「被看的那一刻」自動保持新鮮，但不能為此犧牲頁面載入速度。

已排除的替代方案：

- **Auto-refresh toggle（使用者設定）**：把系統該自己做對的決定推給使用者，多出 settings UI 與偏好持久化，違反專案 design restraint 原則。
- **每日 cron 排程**：design v7 明確列在「❌ 不做」；且在使用者不看的時候刷新是浪費。

選定方案：**stale-while-revalidate** — 進頁面先立即顯示 DB 舊資料（標注同步時間），若資料過期則在背景自動觸發 ingest，完成後刷新畫面。

成本前提：ingestion 已是增量的（以 `gmailMessageId` dedupe，重跑只付一次 Gmail list + 新信的 LLM 費用），所以頻繁同步的成本很低，瓶頸只在延遲（幾秒），適合放背景。

## 設計

### 1. Schema

`User` 加欄位：

```prisma
lastIngestAt DateTime?
```

`ingestEmails()` 成功跑完後更新此欄位。**就算該次沒有新信也更新**——它記錄的是「上次同步時間」，不是「上次有新資料的時間」。

### 2. 新鮮度判斷

- `src/lib/constants.ts` 加 `AUTO_SYNC_THRESHOLD_HOURS = 12`（client-safe 常數）。
- 純函式 `isIngestStale(lastIngestAt: Date | null, now: Date): boolean`：`lastIngestAt` 為 `null` 或距 `now` 超過門檻 → stale。抽成純函式以便單測。

### 3. 觸發流程

- Dashboard server component 讀 `user.lastIngestAt`，把 `lastIngestAt` 與 `isStale` 傳給新的 client component `AutoSync`。
- `AutoSync` 在 mount 時若 stale → 呼叫 `ingestSubscriptionEmails` server action → 完成後 `router.refresh()`。
- **Server action 內部再檢查一次新鮮度**：fresh 就直接 skip 回傳（回傳值需可區分 skipped / 已執行）。這擋掉多分頁與快速切頁的重複觸發，client 端不需要加鎖。就算真的重複執行，ingestion 本身 idempotent，只是浪費一次 Gmail list。
- 手動按鈕保留，改為 `force: true` 參數繞過新鮮度檢查（語意：立即重新掃描）。

### 4. UI

- Header 附近顯示「上次同步：N 小時前」；`lastIngestAt` 為 `null` 時顯示「尚未同步」。
- 背景同步進行中顯示「同步中…」文字 **加 loading spinner**，為非阻斷的小型 indicator——舊資料照常顯示、可互動。
- 背景同步失敗顯示一行非阻斷錯誤文字；token 過期沿用現有 `RefreshAccessTokenError` banner。

### 5. 附帶效果：首次登入 onboarding

新用戶 `lastIngestAt` 為 `null` → 第一次進 dashboard 即自動觸發 ingestion，等同 design v7 Flow 1 的「進 dashboard 自動開始掃信」（streaming progress 是之後 SSE 的範圍，不在本 spec）。空狀態期間顯示同步中 indicator（含 spinner）。

### 6. 錯誤處理

- 背景 ingest 拋錯：`AutoSync` catch 後顯示非阻斷錯誤文字，不影響已 render 的 dashboard。
- `RefreshAccessTokenError`：server action 既有的 throw 行為不變，由現有 banner 呈現。
- 重複觸發：以 server-side 新鮮度 re-check 為主要防線；ingestion 的 `gmailMessageId` dedupe 為第二道保險。

### 7. 測試

- `isIngestStale` 單測：`null`、剛同步、剛好超過門檻。
- Server action skip-if-fresh 邏輯測試（fresh → skip；stale → 執行；`force` → 一律執行）。
- `ingestEmails` 成功後更新 `lastIngestAt` 的測試（含「沒有新信也更新」）。

## 範圍外（明確不做）

- 閒置偵測（「幾個月沒信 → 可能已取消」）：屬 F7 `detect_anomalies` 的 idle type，走 8a alert，另案處理。
- SSE streaming ingestion progress：之後的 feature。
- Auto-refresh 使用者設定 / toggle。
- Cron 排程。

## 參數決策紀錄

- 門檻 12 小時：訂閱信頻率低，不需要更即時；調低成本也幾乎一樣，只是快速反覆進頁面會多幾次背景 Gmail list。單一常數，日後可調。
