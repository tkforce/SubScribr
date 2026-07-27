# AI Subscription Manager — v8 完整規劃

**v8 變動**：F8 的兩個 AI 區塊（8a「本週需要注意」+ 8b「本月分析」）合併為單一「訂閱分析」區塊；分析結果落地為 `Analysis` table，成為 BillingEvent log 的第三層 derived state；分析改由 ingest 觸發，不再有手動重新分析入口；卡片移除 action buttons；`Alert` table 移除。其他部分沿用 v7。詳見 Part 7a。

---

## Part 1：功能清單

### F1 — Gmail OAuth + Email Ingestion

- Google OAuth + Gmail read-only scope
- **Gmail API `q=` 參數做 server-side filter**：subject 包含訂閱關鍵字 + `newer_than:90d`
- 應用層 30 行 minimal blacklist filter（擋 calendar invite / password reset / 純行銷）
- HTML → plain text 前處理
- **Privacy-by-design**：Email body 處理時只在 in-memory，不落地
- 只儲存最小 metadata（gmailMessageId、emailReceivedAt）
- 手動觸發 re-scan 按鈕
- **Freshness gate**：`AUTO_SYNC_THRESHOLD_HOURS = 12`，dashboard 進站時若 stale 才自動同步

### F2 — LLM Extraction Pipeline + Eval Harness ⭐

- **Per-email 並行 extraction**（pMap concurrency 5–10）
- Vercel AI SDK + Claude Sonnet，structured output (Zod schema)
- **LLM 自己判斷 `isSubscriptionRelated`**，false 直接 skip（不入庫、不存任何欄位、只 log）
- 訂閱信抽取欄位：
  - 訂閱資訊：rawServiceName、amount、currency、cycle、category
  - ~~Trial 訊號：isTrial、trialEndsAt~~ —— 已移除，見「明確不做」
  - ~~nextBillingDate~~ —— 已移除；改在 query 層從 `lastSeenAt + cycle` 推算，見 F6
  - Email signal type：billing / trial_reminder / we_miss_you / price_change / renewal_notice / cancellation
- **無 confidence 欄位**（用 schema 結構處理品質）
- **80 筆繁中 golden set**（涵蓋 15 個服務、各 emailSignalType、含 false positive cases）
- Eval script：per-field accuracy / precision / recall / F1
- Prompt versioning + 每版 eval 結果記錄
- Public accuracy page（`/eval`）

### F3 — Service Normalization Module

- TypeScript module：`SERVICE_REGISTRY` with 15 canonical services
- Week 2 起步版：**空殼或只填 canonical IDs**，aliases 由 Week 5 反推填入
- 每個 service：canonical ID、displayName、category、aliases
- `normalizeServiceName(rawName)` **只兩層**：
  - Tier 1: Exact alias match（case-insensitive）
  - Fallback: Slugify
- **明確不做** Tier 2 fuzzy contains match（會 silent fail）
- 單元測試覆蓋
- Week 5 寫 backfill script，根據 LLM 真實輸出反推 aliases 並回填歷史

### F4 — Hybrid Data Model（Subscription + BillingEvent）⭐

- **BillingEvent**：事件日誌，immutable，永不修改，**唯一真實來源**
  - 每封 email 一筆（除非 LLM 判定不是訂閱）
  - 保留 LLM 原始輸出（rawServiceName、promptVersion）
- **Subscription**：當前狀態 table，由 BillingEvent replay 推導，使用者可編輯
  - 一個 service 一筆紀錄
  - Status：active / cancelled / hidden
  - 使用者可修改：displayName、category、status
- **Analysis**：AI 分析結果，由 BillingEvent 推導（v8 新增，見 F8）
- Trend / 漲價偵測 → 從 BillingEvent
- 當前清單 → 直接讀 Subscription

### F5 — Service Knowledge Module

- TypeScript typed module，包 15 個服務的 structured data
- 內容：plan tiers、近期漲價歷史、家庭方案規則、常見 plan name aliasing、取消訂閱網址
- 直接 inject 進 agent prompt（總量約 30KB）
- 介面設計成「未來可換 RAG」的形狀
- 查不到時回傳 `{ found: false, note }` 的 structured not-found，讓 agent 優雅降級

### F6 — Dashboard Foundation

- 月支出總覽：當月總額、vs 上月變化、TWD 統一顯示
- 月支出趨勢圖：最近 6 個月（recharts）
- 分類 breakdown：pie / bar chart
- 訂閱列表：filter / sort、可展開看 BillingEvent 歷史
- **使用者編輯**：修改 displayName / category、隱藏訂閱
- Empty / loading / error states
- Design system
- **下次扣款：query 層即時推算，不落地**
  - `projectNextBilling(lastSeenAt, cycle, now)` 純函式，從最近一封帳單信往後推整數個週期到第一個未來日期
  - 原本設計是抽取 LLM 讀到的日期，但 `BillingEvent` 沒有這個 column，抽出來就被丟掉 —— 每一筆的 `nextBillingDate` 都是 null，欄位永遠顯示「—」，`upcoming_renewal` 也從來沒觸發過
  - 選擇推算而非補 schema：**不用 migration、不用重跑 ingest，現有資料立刻有值**
  - 兩個實作細節：月底要 clamp（1/31 + 1 個月不是 3/3）；每一步從**原始錨點**算而非從上一次結果疊加，否則 2 月被 clamp 成 28 號會把之後每個月都往下拖
  - 準確度取捨：假設信件寄達日 ≈ 扣款日。`billing` 收據準，`renewal_notice`（「7 天後續約」）會早最多一週

### F7 — Single-Agent with Tools

- 一個 agent 配 4 個 specialized tools
- Vercel AI SDK 的 multi-step tool use
- **Tools**：
  - `query_subscriptions(filter)` — 從 Subscription table 直接查
  - `calculate_trend(serviceName, months)` — 從 BillingEvent aggregate
  - `detect_anomalies(types)` — 重複、閒置、漲價、即將續約
  - `get_service_info(serviceName)` — 從 service knowledge module 查
- **`userId` 透過 closure 綁定，絕不放進任何 inputSchema** —— LLM 不能控制 tenant 邊界
- Tool 回傳值預先算好衍生數字（`monthlyAmountTwd`、`totalMonthlyTwd`），模型不做算術
- Agent trace logging

### F8 — AI-Powered Dashboard Section ⭐（v8 大改）

**單一「訂閱分析」區塊**（原 8a + 8b 合併）

- **兩階段 agent**：
  - Phase 1：`streamText` + 4 tools，`stopWhen: stepCountIs(8)`，產出自然語言分析
  - Phase 2：`generateObject` + Zod schema，`temperature: 0`，約束成可渲染結構
- **輸出**：`{ headline, insights[] }`
  - `headline`：一句話 TL;DR，含具體數字
  - `insights`：依 priority 排序、程式端截到 5 則
    - `kind`：`alert` 需要注意 / `change` 本月變動 / `observation` 跨服務模式
    - `priority`：high 🔴 / medium 🟡 / low 🟢
    - `serviceName` / `title` / `detail`
    - `suggestion?`：一句話建議，貼在它所對應的事實旁邊
- **SSE streaming progress**：phase 1 的 `fullStream` 中 `tool-call` / `tool-result` chunk 轉成進度文字
- **結果落地**：存進 `Analysis` table，一個 user 一筆，整筆覆蓋
- **觸發時機**：ingest 完成後自動觸發，**沒有手動重新分析入口**
- **區塊可收合**，收合時保留標題與新鮮度標籤

### ❌ 明確不做（v8 確認版）

**v8 新增的不做**：

- **8a / 8b 兩個獨立 AI 區塊**（合併為一個）
- **獨立的 `observation` / `recommendations` 敘事區塊**（併入卡片）
- **卡片上的 action buttons**（保留 / 稍後提醒 / 前往取消）
- **手動「重新分析」按鈕**
- **`Alert` table 與 per-card dismiss / snooze 生命週期**
- **分析結果的歷史版本**（一個 user 一筆，覆蓋）
- **分析的時間過期規則**（ingest freshness gate 已涵蓋）
- **Phase 2 的 streaming**（輸出太小，成本效益不成立）
- **Trial 訂閱追蹤**（`isTrial` / `trialEndsAt` / 試用 badge / `trial_ends` 提醒）—— 見下方

**為什麼不追蹤 trial**：

「沒有付費就不列入訂閱管理範圍」這條政策**其實從一開始就寫在 `CONCRETE_SIGNALS` 裡了** —— `deriveSubscriptionState` 只認 billing / price_change / renewal_notice / cancellation，一個信件史只有試用提醒的服務根本不會被 materialize 成 Subscription。

問題是上層還疊了一整套 trial 機制，而它們在這個政策底下**沒有任何可以正常運作的路徑**：

- `isTrial` 是單向閂鎖，設成 true 之後沒有分支能清掉
- 加上 trial 提醒不是 concrete signal，`isTrial=true` 只可能出現在**同時有扣款證據**的訂閱上 —— 也就是試用**已經轉正**的那些
- 結果 badge 的語意是反的：真正試用中的訂閱不會出現在列表，轉正後的訂閱永遠掛著「試用」
- `trialEndsAt` 從來沒有任何程式寫入過，所以 `trial_ends` 提醒是雙重死的

所以這不是砍功能，是**把一個已經做過的決定收尾**。

**但 `trial_reminder` 這個 emailSignalType 要留著**：不追蹤不等於不辨識。拿掉標籤，LLM 就得把「您的試用將於 3 天後結束」歸到別類，最可能是 `renewal_notice` —— 而那**是** concrete signal，會生出一筆金額用猜的幽靈訂閱。它在 fold 裡是 no-op，但作為分類器是承重的，跟 `we_miss_you` 現在的角色一樣。

**代價**：永久放棄「試用快到期，先取消就不會被扣」這類提醒 —— 就訂閱管理而言那大概是價值最高的一種 alert。但要做到它得反轉 `CONCRETE_SIGNALS`（讓試用提醒也能生出訂閱）＋ 加 schema ＋ 重跑 ingest，本來就不在便宜選項的範圍。留給 Phase 2。

**沿用 v7 的不做**：

- Chat UI / conversational interface
- Monthly digest 獨立報告
- Multi-user / multi-tenant
- Mobile / PWA / RWD 768px 以下
- LINE notification
- Cron / 排程自動分析
- 顯示 email 原文 / Email body 儲存
- `get_email_context` tool
- 純 Event Sourcing + UserOverride layer
- Multi-agent architecture
- 真正的 RAG（vector DB）
- 詳盡 sender whitelist（用 Gmail query 取代）
- 詳盡 keyword regex list（用 Gmail query 取代）
- Normalize Tier 2 fuzzy match
- Normalize Tier 3 senderDomain match
- LLM extraction confidence 欄位
- Multi-axis confidence
- 訂閱卡片「為什麼」展開
- Browser extension
- 手動新增訂閱（留 Phase 2）

---

## Part 2：User Flows

### Flow 1：First-time Onboarding

```
Landing page
  │
  └─→ [Connect Gmail] ─→ Google OAuth consent (read-only)
                          │
                          ↓
        Privacy notice modal:
        "✅ AI 抽取訂閱資訊
         🔒 不儲存 email 內容
         🔒 只讀取訂閱相關信件"
                          │
                          ↓
              進入 Dashboard(空狀態)
                          │
                          ↓
        Streaming ingestion progress:
        "Gmail 篩選... 找到 89 封候選"
        "並行 LLM 判讀... 處理 10/89"
        "辨識為訂閱 14 封、非訂閱 75 封"
        "Normalize 與 derive 訂閱... 12 個服務"
                          │
                          ↓
              Ingestion 完成 → router.refresh()
                          │
                          ↓
        Server 重算 analysisStale = true
                          │
                          ↓
        訂閱分析區塊自行觸發（useEffect）
        骨架佔位 + 進度文字：
        "整理訂閱資料中..."
        "查詢服務定價資訊中..."
        "計算花費趨勢中..."
        "整理分析結果中..."
                          │
                          ↓
                  完整 Dashboard ready
```

### Flow 2：Returning User

```
進 Dashboard
  │
  ├─→ Server 讀 getAnalysisState(userId)
  │     │
  │     ├─→ fresh：直接渲染已存分析 +「N 小時前分析」
  │     └─→ stale：骨架 + 背景重新分析
  │
  ├─→ 看「本月總覽」卡片
  │
  ├─→ 掃「訂閱分析」區塊
  │     │
  │     ├─→ headline 一句話總結
  │     ├─→ 🔴🟡🟢 卡片（含 suggestion 文字）
  │     └─→ [收合] 只留標題與時間
  │
  └─→ 訂閱列表（filter / sort）
        │
        ├─→ 展開單一訂閱
        │   ├─→ 看 BillingEvent 歷史（金額變化）
        │   ├─→ [編輯] → 改 displayName / category
        │   └─→ [隱藏] → status='hidden'
        │
        └─→ 已隱藏訂閱可在 [設定] 頁面 unhide
```

**與 v7 的差異**：分析卡片是**純呈現**，沒有 [前往取消] / [保留] / [稍後提醒] 按鈕；使用者也無法主動觸發重新分析。

### Flow 3：使用者修改訂閱

```
訂閱卡片：Cursor Pro
─────────────────
分類：AI ▾
[編輯] [⋯]
   │
   ├─→ [編輯] → modal
   │     │   修改 displayName: "Cursor Pro (公司)"
   │     │   修改 category: AI → Productivity
   │     │   [儲存]
   │     ↓
   │   UPDATE subscriptions SET ...
   │     ↓
   │   立即 reflect on dashboard
   │
   └─→ [⋯] menu
         │
         ├─→ 隱藏 → UPDATE status='hidden'
         └─→ 標記為已取消 → UPDATE status='cancelled'
```

### Flow 4：面試 Demo Flow（5 分鐘腳本）

```
0:00–0:15  Dashboard 第一眼，建立 positioning
           "Decision-first AI advisor"

0:15–1:00  Re-scan 展示
           點 [同步] → ingestion → 分析自動接上
           "Per-email 並行 LLM 判讀"
           "Privacy-by-design：body 不落地"
           "分析不是獨立動作，是 ingest 的衍生結果"

1:00–2:00  訂閱分析區塊
           SSE 進度文字 → 卡片
           "一次 agent 呼叫、四個工具"
           "為什麼原本的兩個區塊合併了"

2:00–2:50  Dashboard 編輯展示
           點訂閱 [編輯] → 改分類 → 立即更新
           "Hybrid data model"

2:50–3:30  /eval page
           "80 筆 golden set, 76% → 91%"
           "含 false positive 測試"

3:30–4:30  深入技術決策（多選 2–3 個）
           - "為什麼分析是 derived state 而不是 cache"
           - "為什麼砍掉 action buttons"
           - "為什麼 hybrid 不是 pure event sourcing"
           - "為什麼 LLM 做判斷，code 做 normalize"
           - "為什麼這專案不需要 RAG"
           - "token 成本是隨 step 數成長的"

4:30–5:00  Phase 2 roadmap
```

---

## Part 3：High-Level System Design

### 整體架構

```
┌──────────────────────────────────────────────────────────────────┐
│                       Browser (Next.js Client)                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Dashboard UI                                               │  │
│  │  ├── Overview Card                                          │  │
│  │  ├── Trend Chart (recharts)         ◄── from BillingEvent   │  │
│  │  ├── 訂閱分析（可收合）              ◄── SSE streaming        │  │
│  │  │   └── headline + insights[]      ◄── from Analysis       │  │
│  │  └── Subscriptions List              ◄── from Subscription  │  │
│  │      └── Edit / Hide actions  ──────► UPDATE Subscription   │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬────────────────────────────────────┘
                              │ Server Actions / API Routes (SSE)
┌─────────────────────────────┴────────────────────────────────────┐
│                     Next.js Server (App Router)                   │
│                                                                    │
│  ┌──────────────┐  ┌──────────────────────────┐  ┌────────────┐  │
│  │ Auth Layer   │  │   Ingestion Pipeline     │  │ Agent Layer │  │
│  │              │  │                           │  │             │  │
│  │ NextAuth +   │  │  Gmail API (q= filter)   │  │ ┌─────────┐ │  │
│  │ Google       │  │      ↓                    │  │ │ Phase 1 │ │  │
│  │ OAuth        │  │  Minimal Blacklist        │  │ │streamText│ │  │
│  └──────────────┘  │      ↓                    │  │ │ + tools │ │  │
│                    │  HTML → Text (in-memory)  │  │ └────┬────┘ │  │
│                    │      ↓                    │  │      │      │  │
│                    │  ┌────────────────────┐   │  │ ┌────┴────┐ │  │
│                    │  │ Parallel LLM       │   │  │ │  Tools  │ │  │
│                    │  │ (pMap, conc=10)    │   │  │ ├─────────┤ │  │
│                    │  └─────────┬──────────┘   │  │ │ query_  │ │  │
│                    │            ↓              │  │ │ subs    │ │  │
│                    │  isSubscriptionRelated?   │  │ ├─────────┤ │  │
│                    │      no → skip+log        │  │ │ calc_   │ │  │
│                    │      yes ↓                │  │ │ trend   │ │  │
│                    │  ┌────────────────────┐   │  │ ├─────────┤ │  │
│                    │  │ Normalize          │   │  │ │ detect_ │ │  │
│                    │  │ (Tier 1 + slugify) │   │  │ │ anomaly │ │  │
│                    │  └─────────┬──────────┘   │  │ ├─────────┤ │  │
│                    │            ↓              │  │ │ get_    │ │  │
│                    │  ┌────────────────────┐   │  │ │ service │ │  │
│                    │  │ INSERT BillingEvent│   │  │ └─────────┘ │  │
│                    │  └─────────┬──────────┘   │  │      │      │  │
│                    │            ↓              │  │ ┌────┴────┐ │  │
│                    │  ┌────────────────────┐   │  │ │ Phase 2 │ │  │
│                    │  │ derive Subscription│   │  │ │generate │ │  │
│                    │  │ (replay-from-      │   │  │ │ Object  │ │  │
│                    │  │  scratch fold)     │   │  │ └────┬────┘ │  │
│                    │  └─────────┬──────────┘   │  └──────┼──────┘  │
│                    │            ↓              │         ↓         │
│                    │     lastIngestAt++        │  ┌────────────┐   │
│                    └────────────┬──────────────┘  │  Analysis  │   │
│                                 │                 │  (upsert)  │   │
│                                 └────触发────────► │ AgentTrace │   │
│                                                   └────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Static Modules (in code, not DB)                            │  │
│  │ ┌──────────────────────┐  ┌────────────────────────────┐   │  │
│  │ │ SERVICE_REGISTRY     │  │ SERVICE_KNOWLEDGE          │   │  │
│  │ │ (15 canonical IDs +  │  │ (plan tiers, pricing, etc) │   │  │
│  │ │  aliases via backfill│  │ ~30KB inline               │   │  │
│  │ └──────────────────────┘  └────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Eval Harness                                                │  │
│  │ /eval page + scripts + 80-sample golden set                 │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────┬─────────────────────────────────────────────┘
                      │
        ┌─────────────┴──────────────┬─────────────────┐
        ↓                            ↓                 ↓
┌──────────────┐          ┌─────────────────┐  ┌────────────┐
│  Supabase    │          │  Gemini / LLM   │  │  Gmail API │
│  (Postgres)  │          │  (Vercel AI SDK)│  │  (Google)  │
└──────────────┘          └─────────────────┘  └────────────┘
```

### Data Schema (Prisma)

```prisma
model User {
  id           String    @id @default(cuid())
  email        String    @unique
  gmailToken   String?   // encrypted refresh token
  createdAt    DateTime  @default(now())
  lastIngestAt DateTime?

  subscriptions Subscription[]
  billingEvents BillingEvent[]
  agentTraces   AgentTrace[]
  analysis      Analysis?
}

// 當前訂閱狀態：由 BillingEvent replay 推導，使用者可編輯
model Subscription {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])

  serviceName     String   // canonical ID (e.g. "cursor")
  displayName     String?  // 使用者可自訂顯示名

  amount          Decimal
  currency        String   // TWD | USD | JPY
  amountInTwd     Decimal  // 統一換算
  cycle           String   // monthly | yearly | quarterly | one-time
  nextBillingDate DateTime?  // ⚠️ 死欄位：無人寫入、無人讀取，待清（見 Part 9）
  category        String   // entertainment | productivity | ai | cloud | comm | other

  status          String   @default("active")  // active | cancelled | hidden
  cancelledAt     DateTime?
  hiddenAt        DateTime?

  source          String   @default("gmail")  // gmail | user_manual

  // 沒有 isTrial / trialEndsAt：未付費的訂閱不在管理範圍（見「明確不做」）

  firstSeenAt     DateTime
  lastSeenAt      DateTime  // 也是 nextBillingDate 推算的錨點

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  billingEvents   BillingEvent[]

  @@unique([userId, serviceName])
  @@index([userId, status])
}

// 事件日誌：immutable，唯一真實來源
model BillingEvent {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])

  subscriptionId  String?
  subscription    Subscription? @relation(fields: [subscriptionId], references: [id])

  gmailMessageId  String   @unique
  emailReceivedAt DateTime

  rawServiceName  String   // LLM 原始輸出（normalize alias 來源）
  serviceName     String   // normalize 後的 canonical ID
  amount          Decimal
  currency        String
  amountInTwd     Decimal
  cycle           String
  category        String
  emailSignalType String   // billing | trial_reminder | we_miss_you | price_change | renewal_notice | cancellation

  promptVersion   String

  createdAt       DateTime @default(now())

  @@index([userId, serviceName, emailReceivedAt(sort: Desc)])
  @@index([userId, emailReceivedAt])
}

// ⭐ v8 新增：AI 分析結果，BillingEvent log 的第三層 derived state
model Analysis {
  id     String @id @default(cuid())
  userId String @unique          // 一人一筆 → upsert，無歷史版本
  user   User   @relation(fields: [userId], references: [id])

  payload Json                   // Zod 驗證過的 { headline, insights[] }

  basedOnIngestAt DateTime       // 產生當下的 user.lastIngestAt（新鮮度主鍵）
  promptVersion   String         // 第二個新鮮度條件

  generatedAt DateTime @default(now())
}

model AgentTrace {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])

  section      String   // "analysis"
  steps        Json     // stepBreakdown：每步呼叫了哪些 tool、花多少 token
  totalTokens  Int
  totalCostUsd Decimal  // 暫時為 0，需要 per-model 定價表
  status       String   // success | failed

  createdAt    DateTime @default(now())

  @@index([userId, createdAt])
}

// ❌ v8 移除：model Alert
// 它存在的目的是支撐每張卡片的 dismiss / snooze 生命週期，
// 而那個需求隨 action buttons 一起被砍掉了。
// 它的形狀（一列一張卡 + status）跟「一次 ingest 一包 blob」是衝突的，
// 所以刻意不硬套進去用，直接移除。
```

### Analysis Output Schema (Zod)

```typescript
export const InsightSchema = z.object({
  // alert 需要注意 / change 本月變動 / observation 跨服務的模式
  kind: z.enum(["alert", "change", "observation"]),
  priority: z.enum(["high", "medium", "low"]),
  serviceName: z.string(),
  title: z.string(),   // 一句話標題
  detail: z.string(),  // 具體說明，含數字與幣別
  // 一句話建議，緊貼著它所對應的那個事實。純陳述事實的項目可省略。
  suggestion: z.string().optional(),
});

export const AnalysisSchema = z.object({
  headline: z.string(),              // 一句話 TL;DR
  insights: z.array(InsightSchema),  // 程式端排序並截到 5 則
});
```

**為什麼沒有獨立的 `observation` / `recommendations` 欄位**：v1 有，但它們重述卡片內容。`recommendations` 是針對單一項目的建議，而卡片本來就在做這件事 —— 同一個軸講兩次，調 prompt 也解決不了。跨服務的模式改用 `kind: "observation"` 卡片承載，單項建議改用每張卡片自己的 `suggestion`。

### Analysis 新鮮度判斷

```typescript
stale =
  lastIngestAt === null                              // 從沒同步過
  || stored === null                                 // 沒存過
  || stored.promptVersion !== ANALYSIS_PROMPT_VERSION // 換過 prompt / schema
  || stored.basedOnIngestAt < lastIngestAt            // 事件日誌已前進
```

**兩種 stale，只有一種還能顯示**：

| 種類 | 成因 | 觸發重跑 | 舊內容可顯示 |
| ---- | ---- | -------- | ------------ |
| 資料過期 | 日誌前進了 | ✅ | ✅（但 v8 UI 選擇清空，見下） |
| 版本過期 | schema 換了 | ✅ | ❌ payload 缺欄位 |

**`promptVersion` 是必要的，不是保險**：Zod 預設**剝除**未知欄位而不是拒絕，所以舊 schema 的 payload 照樣 parse 成功、只是靜默丟掉欄位，然後被當成最新的一直服務下去。版本戳記才是真正強制重新產生的機制。

**刻意沒有時間過期條件**：`AUTO_SYNC_THRESHOLD_HOURS = 12` 已經保證至少每 12 小時同步一次，「ingest 跑了」本身就是「有意義的時間過去了」的 proxy。多一條時間衰減規則不會更正確，只會讓判斷從一句話變兩句話。

### Analysis Agent Flow

```
runAnalysis(userId, model, onEvent)
        │
        ↓
  getActiveSubscriptions()
        │
        ├─→ 沒有使用中訂閱 → return null（完全不呼叫 LLM）★唯一閘門
        │
        ↓
  detectAnomalies() + getMonthlyTrend() 併發
  computeOverview() → totalMonthlyTwd
        │
        ↓
┌───────────────────────────────────────────┐
│ Phase 1：streamText + 4 tools             │
│   stopWhen: stepCountIs(8)                │
│   prompt 起點：異常事實 JSON               │
│               + 6 個月趨勢                 │
│               + 與上月比較                 │
│                                            │
│   for await (chunk of fullStream)         │
│     tool-call   → SSE progress            │
│     tool-result → SSE progress            │
│     text-delta  → 丟棄                     │
└─────────────────┬─────────────────────────┘
                  ↓ 自然語言分析
┌───────────────────────────────────────────┐
│ Phase 2：generateObject                    │
│   schema: AnalysisSchema                   │
│   temperature: 0                           │
│   ❌ 不做 streaming（輸出太小）             │
└─────────────────┬─────────────────────────┘
                  ↓
  capInsights(5) · sortInsightsByPriority
                  ↓
  onEvent({ type: "done", analysis, usage })
                  ↓
  upsert Analysis + create AgentTrace
```

**唯一閘門是「沒有使用中訂閱」**。v7 的 8a 還會在「異常掃描為空」時跳過，v8 拿掉了 —— 一個沒有異常的月份仍然有支出回顧值得寫。

### Prompt 護欄（全部來自真實失敗）

| 觀察到的錯誤輸出 | 加上的規則 |
| ---------------- | ---------- |
| 「取消其中一個以節省合計 841 TWD」—— 841 是兩個服務的總和 | 可節省金額只能是該服務自己的月費；同分類合計金額不是可節省金額 |
| 疑似重複訂閱被標成 🔴 high，但那本質上不確定（可能是家人門號） | 同分類多個服務一律最高 medium，且必須留在卡片清單、不能降級成敘述 |
| 建議寫「稍後提醒您」，但產品沒有提醒功能 | 絕對不要提到不存在的功能；只能建議使用者自己去做或確認什麼 |
| headline 說「有 3 件事需要注意」但只列了 2 則 | headline 的數字必須等於實際 insights 則數，沒把握就不寫數字 |
| agent 一次查一個服務，8 步用滿被截斷，token 46k | 一次把需要的資料查齊；每多一輪往返都會重送完整對話 |

**Token 成本的真正變因**：成本隨 **step 數**而非 tool call 數成長，因為每一輪都會重送整段對話。同一份資料，批次平行呼叫是 2 步 / 15k tokens，循序一個一個查變成 8 步（觸頂）/ 46k tokens。`stepCountIs(8)` 不需要調整 —— 問題不在上限，在批次策略。

### SSE Transport

**手刻 `ReadableStream` + 自訂事件格式**，不用 AI SDK 內建的 response helper。查過實際安裝的 `ai@5.0.193` 型別定義後的決定：

| Helper | 為什麼不能用 |
| ------ | ------------ |
| `pipeTextStreamToResponse` / `pipeUIMessageStreamToResponse` | 吃 Node.js `ServerResponse`，App Router 的 Route Handler 拿不到 |
| `toTextStreamResponse()` | 只吐純文字 delta，丟掉所有 tool-call 事件 |
| `toUIMessageStreamResponse()` | 綁死在 chat 協定，而本專案明確不做 chat UI，事件語意對不上 |

事件格式：

```
data: {"type":"progress","message":"整理訂閱資料中..."}

data: {"type":"tool-call","toolName":"get_service_info"}

data: {"type":"done","analysis":{...},"usage":{...}}
```

**Client 端不能用 `EventSource`** —— 原生 API 只能發 GET、不能帶 body，而這條路由是帶副作用的 POST。所以用 `fetch` + `getReader()` 手動解析，`parseSseBuffer()` 處理跨網路封包切斷的半截 frame。

### UI 觸發鏈

```
AutoSync 同步完 → router.refresh()
        ↓
Server Component 重算 getAnalysisState()
        ↓
AnalysisSection 收到新的 stale prop
        ↓
useEffect 自行觸發（useRef 擋 StrictMode 重複）
        ↓
POST /api/analyze
        ↓
Route 再檢查一次新鮮度（多分頁 guard）
        ↓
SSE stream → 骨架 + 進度文字 → 卡片
```

**不需要任何 callback 串接**：server 判斷該不該做，client 負責完成 —— 跟 `AutoSync` 處理 ingest 的模式完全一致。

**Server 端必須再擋一次**：理由跟 ingest action 相同 —— 多分頁或快速導覽不能疊加重複的 agent 呼叫。

### 四種畫面狀態

| 狀態 | 畫面 | 右上角 |
| ---- | ---- | ------ |
| 尚未分析 | 「尚未分析。」／無訂閱時「尚無訂閱資料可供分析。」 | 尚未分析 |
| 分析中 | 骨架佔位（headline 條 + 3 張卡片輪廓，脈動） | 轉圈 + 目前工具，例如「查詢服務定價資訊中...」 |
| 完成 | headline + 依優先級排序的卡片 | 剛剛分析 / N 小時前分析 |
| 失敗 | 保留上次內容，標題下方顯示錯誤 | 上次分析時間 |

**為什麼分析中要清空舊內容**（與 v7 的 stale-while-revalidate 相反）：訂閱列表的舊資料只是「稍微過期」，但分析的 headline 會直接宣稱「有 4 件事需要注意」—— 日誌變了之後那句話**不是舊的，是錯的**，而且擺在轉圈圖示旁邊仍然讀起來像當前狀態。骨架高度做得跟真實內容相近，結果進來時頁面不會跳動。

### Tool 實作對照表

| Tool                               | 從哪裡查                                                            |
| ---------------------------------- | ------------------------------------------------------------------- |
| `query_subscriptions(filter)`      | **Subscription table 直接讀**（附預算好的 monthlyAmountTwd / totalMonthlyTwd） |
| `calculate_trend(service, months)` | **BillingEvent aggregate**                                          |
| `detect_anomalies(types)`          | 兩邊都用（duplicate 看 Subscription、price_change 看 BillingEvent） |
| `get_service_info(service)`        | **service-knowledge.ts** 純 in-memory                               |

### Tech Stack

| Layer       | Choice                       | 理由                 |
| ----------- | ---------------------------- | -------------------- |
| Framework   | Next.js 16 App Router        | 你的本業             |
| Language    | TypeScript                   | 你的本業             |
| Styling     | Tailwind + base-ui           | 開發速度最快         |
| Database    | Supabase (Postgres)          | Auth + DB 一站搞定   |
| ORM         | Prisma 7                     | 你有經驗             |
| Auth        | NextAuth + Google OAuth      | 內建 Gmail scope     |
| LLM         | Gemini（可換）               | `src/lib/llm.ts` 單一切換點 |
| LLM SDK     | Vercel AI SDK v5             | streaming + tool use |
| Parallelism | p-map                        | 並行 extraction      |
| Charts      | recharts                     | React-native         |
| Deploy      | Vercel                       | 與 Next.js 配套      |

---

## Part 4：12 週每週計畫（含實際執行狀態）

### 🏗 Phase 1：基礎 + LLM 入門（Week 1–4）

**Week 1：Setup + Gmail OAuth** ✅
**Week 2：極簡 Pipeline 骨架** ✅
**Week 3：LLM Extraction 入門 + isSubscriptionRelated 自判** ✅
**Week 4：Eval Harness + 80 筆 Golden Set** ✅

### 🧠 Phase 2：Tool Use + Agent（Week 5–8）

**Week 5：Prompt Iteration + Normalization Backfill**
⚠️ **部分完成** —— aliases 反推回填尚未做（見 Part 9 已知問題）

**Week 6：Service Knowledge Module + Tool Use 入門** ✅
**Week 7：Single-Agent + Multi-Step Tool Use** ✅

**Week 8：Robustness + Buffer Week** ⏭️ **跳過**
- 原訂：tool failure handling、三層 fallback、trace viewer
- 實際：只做了基本的 error event + AgentTrace 落地，**沒有三層 fallback**
- 影響：分析失敗時只顯示錯誤訊息 + 保留上次結果，不會自動降級成 single-prompt 或 static

### 🎨 Phase 3：Dashboard 整合（Week 9–11）

**Week 9：Dashboard 骨架 + 編輯功能** ⏭️ **跳過（骨架已於前期完成）**
- 總覽卡、趨勢圖、訂閱列表已存在
- **編輯功能（修改 displayName / category、隱藏訂閱）尚未實作**

**Week 10：AI Sections + Streaming** ✅ **完成，且範圍變更**
- SSE 手刻完成、agent 接上、結果落地
- 範圍變更：兩個區塊合併為一個、加入持久化、移除手動觸發

**Week 11：Polish + 部署** ⬜ 未開始

### 📦 Phase 4：Portfolio Packaging（Week 12）⬜ 未開始

---

## Part 5：五個面試故事總覽

| 故事                                        | 對應週次       | 核心 Talking Points                                                                                                                                    |
| ------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Eval-driven Extraction**               | Week 4–5       | 80 筆繁中 golden set（含 false positive cases）、accuracy 提升路徑、failure pattern 分類、prompt versioning、model comparison                            |
| **B. Single-Agent + Tools**                 | Week 7–8       | 為什麼不 multi-agent、tool design、為什麼不 RAG、structured not-found 讓 agent 優雅降級、**`userId` 綁 closure 不放 inputSchema 的 tenant 邊界**、**token 成本隨 step 數而非 call 數成長** |
| **C. Decision-first AI UX**                 | Week 9–10      | 為什麼砍 chat、**為什麼把兩個 AI 區塊合併**、**為什麼砍掉 action buttons（LLM 輸出沒有穩定的卡片身分）**、**為什麼沒有重新分析按鈕**、streaming UI 設計 |
| **D. LLM vs Code Boundary**                 | Week 2 + 5 + 6 | LLM 做理解、code 做映射、aliases 反推 backfill、normalize 為什麼不做 fuzzy match、confidence 為什麼不存、**prompt 護欄全部來自真實失敗輸出**            |
| **E. Hybrid Data Model & Design Restraint** | Week 1 + 9     | BillingEvent（immutable）+ Subscription / Analysis（derived）、為什麼不純 event sourcing、replay vs incremental、privacy-by-design、**12 週砍掉一半初始設計的過程（含刪掉一整張 table）** |

**v8 讓故事 C 和 E 明顯變厚**：

- **故事 C** 現在有一條完整的「我照計畫做完兩個區塊，跑起來才發現它們從同一組 tool call 產出重疊內容、成本兩倍，所以合併」的敘事 —— 有證據的取捨比照計畫執行更有說服力。
- **故事 E** 新增第三層 derived state，以及「刪掉一張已經 migrate 進 production 的 table」這個具體的 design restraint 例子。

---

## Part 6：風險與 Plan B

| 風險                           | 觸發點                        | Plan B                                             |
| ------------------------------ | ----------------------------- | -------------------------------------------------- |
| LLM 入門卡關                   | Week 3 Day 5 跑不通           | 延一週、Week 12 縮短                               |
| Golden set 標太慢              | Week 4 結束少於 80 筆         | 50 筆繼續走                                        |
| `isSubscriptionRelated` 效果差 | Week 4 eval false positive 高 | Week 5 加 sender whitelist 補強                    |
| Normalize 反推太慢             | Week 5 Day 5 沒做完           | 接受 v1 normalize 不完美，Week 11 polish 時再補    |
| Single-agent 跑不通            | Week 7 Day 3 仍卡             | 降級 sequential function calls                     |
| Streaming 卡關                 | Week 10 Day 3 仍卡            | 先做非 streaming 版本                              |
| **Analysis token 成本失控**    | **單次分析 > 50k tokens**     | **改用更小的 model 跑 phase 2；或降低 stepCountIs** |
| **分析品質不穩定**             | **同資料多次跑結論不一致**     | **降低 phase 1 temperature；或把更多判斷移進 code** |
| 整體落後 2 週                  | Week 8 結束                   | 砍功能而非砍品質                                   |
| 整體落後 4 週                  | Week 10 結束                  | demo 延到 Month 4，先投履歷                        |

---

## Part 7a：v8 vs v7 主要變動

| 項目                      | v7                                                    | v8                                                                                      |
| ------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| AI 區塊數量               | 兩個（8a 本週需要注意 / 8b 本月分析）                 | **一個（訂閱分析）**                                                                     |
| 合併理由                  | —                                                     | **兩者用同一組 tool 查同一份日誌，把同一件事講兩遍；合併後去重是結構保證的、成本砍半**   |
| Agent 呼叫次數            | 每個區塊各一次（共 2 次兩階段流程）                   | **一次兩階段流程**                                                                       |
| 輸出結構                  | 8a：cards[]；8b：topChanges + observation + recommendations | **`{ headline, insights[] }`** 單一清單                                                  |
| 敘事區塊                  | 獨立的 observation / recommendations 散文             | **併入卡片**：跨服務模式→`kind:"observation"`、單項建議→每卡的 `suggestion`             |
| 卡片動作                  | 保留 / 稍後提醒 / 前往取消 三顆按鈕                   | **純文字 `suggestion`，無按鈕**（LLM 輸出沒有穩定的卡片身分，dismiss 後換句話說會重現） |
| 分析觸發                  | 使用者按 [重新分析]                                   | **ingest 完成後自動觸發，無手動入口**                                                    |
| 分析結果儲存              | 未定義（8a 提到 cache 24 小時）                       | **`Analysis` table，一人一筆整筆覆蓋，BillingEvent log 的第三層 derived state**          |
| 新鮮度判斷                | 時間（24 小時）                                       | **`basedOnIngestAt` + `promptVersion`，無時間條件**（ingest gate 已涵蓋）                |
| `Alert` table             | 存在（per-card dismiss / snooze 生命週期）            | **移除**（action buttons 砍掉後就沒有用途，形狀也跟 blob 模型衝突）                      |
| Dashboard 重整入口        | 3 個（同步 + 兩個重新分析）                           | **1 個（同步）**                                                                         |
| 分析中的舊內容            | （未定義）                                            | **清空，改顯示骨架** —— 過期的 headline 不是舊的而是錯的                                 |
| 區塊可收合                | 無                                                    | **有**（收合時保留標題與新鮮度標籤）                                                     |
| SSE 實作                  | 未定義                                                | **手刻 ReadableStream + 自訂事件**（AI SDK 的 helper 不是 Node-only 就是綁死 chat 協定） |
| Trial 追蹤                | `isTrial` / `trialEndsAt` / 試用 badge / `trial_ends` 提醒 | **全部移除**（未付費不列入管理範圍；`CONCRETE_SIGNALS` 本來就已經是這個政策，上層機制無法自洽） |
| `trial_reminder` signal   | 驅動 `isTrial`                                        | **保留為分類器，fold 裡 no-op** —— 不追蹤 ≠ 不辨識；拿掉標籤會讓試用信被誤歸成 `renewal_notice` 而生出幽靈訂閱 |
| 下次扣款來源              | LLM 抽取後落地                                        | **query 層從 `lastSeenAt + cycle` 即時推算**（原路徑因 BillingEvent 缺 column 而永遠是 null） |
| 面試故事 C / E            | Decision-first UX / Hybrid model                      | **強化：合併的證據鏈、砍 action buttons 的理由、刪掉一整張 table 的 design restraint、以及「砍掉兩個永遠不可能正確的欄位」** |

---

## Part 7b：v7 vs v6 主要變動

| 項目                          | v6                                                            | v7                                                                                          |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Subscription derive 策略      | Incremental UPSERT（mutation + signal-type switch）           | **Replay-from-scratch（pure fold over sorted events）**                                     |
| Time-travel 邊界判斷          | 規則 1：`event < lastSeenAt` 就 skip                          | **不需要**（fold 前先 sort，亂序到達結果一致）                                              |
| Subscription state 可重建性   | 不可逆（mutate 之後失去原始事件）                             | **可隨時 rebuild**（BillingEvent 是 source of truth、derive 純函式）                        |
| Derive trigger 粒度           | Per-event（每筆 BillingEvent 一次）                           | **Per-service per ingest**                                                                  |
| Derive 邏輯可測性             | mutation + DB I/O 混在一起，難純測                            | **pure function 直接吃合成 event 序列**                                                     |
| Derive bug 修復成本           | 修 code + 寫遷移腳本回填                                      | **修 code + 點一次 Ingest** 即自動修復                                                      |

---

## Part 7c：v6 vs v5 主要變動

| 項目                         | v5                                   | v6                                                                  |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| Filter 策略                  | 詳盡 whitelist + keyword             | **Gmail q= filter + 30 行 minimal blacklist**                       |
| Sender whitelist             | Week 2 收集 30 個服務                | **完全不做（用 Gmail query 取代）**                                 |
| Keyword regex 列表           | 維護中英雙語清單                     | **完全不做（用 Gmail query 取代）**                                 |
| Normalize tiers              | 3 層（exact + fuzzy + senderDomain） | **2 層（exact + slugify fallback）**                                |
| SERVICE_REGISTRY 內容        | Week 2 起步版（部分 aliases）        | **Week 2 空殼，Week 5 反推填入**                                    |
| LLM extraction confidence    | 單一 score 欄位                      | **完全不存**                                                        |
| `isSubscriptionRelated` 處理 | 寫進 BillingEvent                    | **不入庫，只 log**                                                  |

---

## Part 8：v8 設計哲學總結

整份 v8 規劃體現三個一致原則：

1. **Defer commitment until you have evidence**（v6）
2. **State should be derivable, not mutable**（v7）
3. **Structure the output so duplication is impossible, not merely discouraged**（v8 新增）

| 領域                    | 應用                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Filter 設計             | Gmail query 已過濾，application 端只擋極端 case                                                               |
| Normalization           | 函式骨架先寫，aliases 等 LLM 跑完反推                                                                         |
| Confidence              | 不存，因為所有 confidence-based 決策都被 schema 結構涵蓋                                                      |
| Data model              | Hybrid 而非 pure event sourcing                                                                               |
| Subscription derive     | Replay-from-scratch：state 是 events 的 pure function                                                         |
| **Analysis derive**     | **同上再套一層。分析沒有獨立生命週期 —— 一次 ingest 一個版本，因此連「快取失效」這個概念都不需要**            |
| **AI 輸出結構**         | **兩個區塊會重述彼此、兩個欄位會重述彼此 —— 解法是讓它們共用同一份清單，而不是寫 prompt 叫模型不要重複**      |
| **AI 互動面**           | **沒有穩定身分的東西不給生命週期。LLM 卡片無法可靠地跨次辨識，所以不做 dismiss / snooze**                     |
| **Trial 追蹤**          | **範圍邊界要有單一執行點。「沒付費不算訂閱」寫在 `CONCRETE_SIGNALS`，上層任何 trial 機制都只是繞過它的死碼** |
| **不追蹤 ≠ 不辨識**     | **`trial_reminder` 留著當分類器。要能穩定排除一類輸入，就得先能穩定認出它 —— 否則它會偽裝成別的類別溜進來**  |
| Architecture            | Single-agent 而非 multi-agent                                                                                 |
| RAG                     | 不用，因為知識量太小                                                                                          |
| Chat UI                 | 不做，因為和 decision-first positioning 衝突                                                                  |

**這份規劃的最大價值不是它做了什麼，而是它選擇不做什麼**。每個被砍掉的功能都對應一個可講的設計取捨 —— v8 甚至砍掉了一張已經 migrate 進 production 的 table，以及兩個永遠不可能算對的欄位。

**一個反覆出現的形態**：`nextBillingDate`、`isTrial`、`trialEndsAt` 三個欄位壞掉的方式一模一樣 —— LLM 有抽、schema 沒地方放、derive 沒賦值、UI 照樣顯示。**型別系統完全沒擋住，因為每一層各自看起來都是合法的**。這類 bug 只有在追一條完整的資料路徑時才會現形，不會在 code review 單看一個檔案時被發現。

---

## Part 9：已知問題（v8 時點）

都在資料層或顯示層，不在分析流程本身：

| 問題 | 成因 | 對應工作 |
| ---- | ---- | -------- |
| `google-one` 被當成 AI 服務，跟 Claude 湊成「重複訂閱」 | 它在 DB 裡的 `category` 就是 `'ai'` —— extraction 階段的分類問題，agent 忠實反映輸入 | F2 prompt / eval |
| `google-ai-plus` 與 `google-one` 金額都是 165 TWD，疑似同一筆 | SERVICE_REGISTRY aliases 反推回填未做（原訂 Week 5） | F3 backfill |
| 卡片顯示 canonical ID（`claude`、`google-one`）而非顯示名稱 | `displayName` 尚未接進這條路徑 | F8 顯示層 |
| `AgentTrace.totalCostUsd` 永遠是 0 | 需要 per-model 定價表 | Week 11 |
| 訂閱編輯功能（displayName / category / 隱藏）未實作 | Week 9 跳過 | F6 |
| 三層 fallback 未實作 | Week 8 跳過 | F7 |
| 登入狀態下的完整觸發鏈未經端到端實測 | 驗證環境沒有 Google session | Week 11 |
| `Subscription.nextBillingDate` 是死欄位（無人寫入、無人讀取） | 改成 query 層推算後遺留；當時的 migration 刻意只涵蓋核可的 trial 兩欄 | 下一支 migration |
| `drop_subscription_trial_fields` migration 尚未套用到 production | **必須先部署新 code 再跑** —— 反過來會讓舊 code 的 `findMany` 撈不到已 drop 的欄位而炸掉 | 部署後 `prisma migrate deploy` |

**有趣的一點**：`google-ai-plus` / `google-one` 這個 normalize 的 bug，是 agent 自己在分析時當成一則 insight 報出來的 —— 分析結果反過來驗證了資料層的問題。

**已解決（2026-07-27）**：

| 原問題 | 根因 | 處置 |
| ---- | ---- | -------- |
| 「下次扣款」欄位全部顯示「—」，`upcoming_renewal` 從未觸發 | LLM 有抽 `nextBillingDate`，但 `BillingEvent` 沒有這個 column，值在落地時被丟棄，derive 也沒有任何分支賦值 | query 層改用 `projectNextBilling(lastSeenAt, cycle, now)` 推算（見 F6） |
| 「試用」badge 語意相反、`trial_ends` 提醒從未觸發 | `isTrial` 是清不掉的單向閂鎖，且因 trial 非 concrete signal 而只出現在已轉正的訂閱上；`trialEndsAt` 從未被寫入 | 整組移除，trial 追蹤劃出範圍（見「明確不做」） |
| 訂閱明細 / 分析卡片之間有灰色陰影帶 | `.glass` 的 shadow（8px offset、32px blur）在 `gap-2`（8px）的間隙裡不會衰減完，相鄰卡片陰影重疊 | 新增 `glass-row` utility，陰影縮到能在間隙內收斂 |
