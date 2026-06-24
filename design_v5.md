# Subscription Manager

Credential:

Client ID:

[***REMOVED-OAUTH-CLIENT-ID***](http://***REMOVED-OAUTH-CLIENT-ID***/)

Client Secret:

***REMOVED-OAUTH-SECRET***

Supabase:

***REMOVED-DB-PASSWORD***

# AI Subscription Manager — v5 完整規劃

---

## Part 1：功能清單

### F1 — Gmail OAuth + Email Ingestion

- Google OAuth + Gmail read-only scope
- 過去 90 天 email 掃描
- 雙層過濾：寄件者白名單（30 個服務網域）+ 中英關鍵字
- HTML → plain text 前處理
- **Privacy-by-design**：Email body 處理時只在 in-memory，不落地
- 只儲存最小 metadata（gmailMessageId、emailReceivedAt）
- 手動觸發 re-scan 按鈕

### F2 — LLM Extraction Pipeline + Eval Harness ⭐

- **Per-email 並行 extraction**（pMap concurrency 5–10）
- Vercel AI SDK + Claude，structured output (Zod schema)
- 單封 email 一次性抽出：
  - 訂閱資訊：rawServiceName、amount、currency、cycle、nextBillingDate、category
  - Trial 訊號：isTrial、trialEndsAt
  - Email signal type：billing / trial_reminder / we_miss_you / price_change / renewal_notice / cancellation
  - confidence score
- **80 筆繁中 golden set**（涵蓋 15 個服務、各 emailSignalType）
- Eval script：per-field accuracy / precision / recall / F1
- Prompt versioning + 每版 eval 結果記錄
- Public accuracy page（`/eval`）

### F3 — Service Normalization Module

- TypeScript module：`SERVICE_REGISTRY` with 15 canonical services
- 每個 service：canonical ID、displayName、category、aliases、senderDomains
- `normalizeServiceName(rawName, senderDomain)` 三層策略：
  - Tier 1: Sender domain 比對（high confidence）
  - Tier 2: Exact alias match（high confidence）
  - Tier 3: Fuzzy contains match（medium confidence）
  - Tier 4: Slugify fallback（low confidence，進 review queue）
- Low-confidence review queue（自己 dev 用）
- 單元測試覆蓋

### F4 — Hybrid Data Model（Subscription + BillingEvent）⭐

- **Subscription**：當前狀態 table，mutable，使用者可編輯
  - 一個 service 一筆紀錄
  - Status：active / cancelled / hidden
  - 使用者可修改：displayName、category、status
- **BillingEvent**：事件日誌，immutable，永不修改
  - 每封 email 一筆
  - 保留 LLM 原始輸出（rawServiceName、promptVersion、confidence）
- **UPSERT 邏輯**：ingestion 時根據 emailSignalType 決定如何更新 Subscription
- Trend / 漲價偵測 → 從 BillingEvent
- 當前清單 → 直接讀 Subscription

### F5 — Service Knowledge Module

- TypeScript typed module，包 15 個服務的 structured data
- 內容：plan tiers、近期漲價歷史、家庭方案規則、常見 plan name aliasing
- 直接 inject 進 agent prompt（總量約 30KB）
- 介面設計成「未來可換 RAG」的形狀

### F6 — Dashboard Foundation

- 月支出總覽：當月總額、vs 上月變化、TWD 統一顯示
- 月支出趨勢圖：最近 6 個月（recharts）
- 分類 breakdown：pie / bar chart
- 訂閱列表：filter / sort、可展開看 BillingEvent 歷史
- **使用者編輯**：修改 displayName / category、隱藏訂閱
- Empty / loading / error states
- Design system

### F7 — Single-Agent with Tools

- 一個 agent 配 4 個 specialized tools
- Vercel AI SDK 的 multi-step tool use
- **Tools**：
  - `query_subscriptions(filter)` — 從 Subscription table 直接查
  - `calculate_trend(serviceName, months)` — 從 BillingEvent aggregate
  - `detect_anomalies(types)` — 重複、閒置、漲價、即將續約
  - `get_service_info(serviceName)` — 從 service knowledge module 查
- 三層 fallback：full agent → single-prompt → static
- Agent trace logging

### F8 — AI-Powered Dashboard Sections ⭐

**8a「本週需要注意」**

- `[重新分析]` 按鈕 → 觸發 agent
- SSE streaming progress text
- Priority cards：🔴 高 / 🟡 中 / 🟢 低
- Action buttons：保留 / 稍後提醒 / 前往取消
- 結果 cache 24 小時

**8b「本月分析」**

- `[重新分析]` 觸發 agent
- 三段 streaming：
  - 本月主要變動（TOP 3）
  - AI 觀察（自然語言敘事）
  - 建議（1–2 個具體行動）

### ❌ 明確不做

- Chat UI / conversational interface
- Monthly digest 獨立報告
- Multi-user / multi-tenant（schema 預留 userId，不實作分享）
- Mobile / PWA / RWD 768px 以下
- LINE notification
- Cron / 排程自動分析
- 顯示 email 原文 / Email body 儲存
- `get_email_context` tool
- 純 Event Sourcing + UserOverride layer
- Multi-agent architecture
- 真正的 RAG（vector DB）
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
              進入 Dashboard（空狀態）
                          │
                          ↓
        Streaming ingestion progress:
        "掃描 Gmail... 找到 127 封候選"
        "並行 LLM 抽取... 處理 10/127"
        "並行 LLM 抽取... 處理 50/127"
        "Normalize 與 UPSERT 訂閱... 14 個服務"
                          │
                          ↓
              Ingestion 完成
                          │
              ┌───────────┴───────────┐
              ↓                       ↓
      自動觸發 8a 分析         自動觸發 8b 分析
              ↓                       ↓
              └───────────┬───────────┘
                          ↓
                  完整 Dashboard ready
```

### Flow 2：Returning User

```
進 Dashboard
  │
  ├─→ 看「本月總覽」卡片
  │
  ├─→ 掃「本週需要注意」區塊
  │     │
  │     └─→ 點 🔴 alert card
  │           ↓
  │     展開 detail：金額 / 週期 / 信號類型
  │           ↓
  │           ├─→ [前往取消] → 開新分頁
  │           ├─→ [保留] → 卡片消失
  │           └─→ [稍後提醒] → N 天後再提醒
  │
  ├─→ 看「本月分析」自然語言敘事
  │
  └─→ 訂閱列表（filter / sort）
        │
        ├─→ 展開單一訂閱
        │   │
        │   ├─→ 看 BillingEvent 歷史（金額變化、近 6 期）
        │   ├─→ [編輯] → 改 displayName / category
        │   └─→ [隱藏] → status='hidden'
        │
        └─→ 已隱藏訂閱可在 [設定] 頁面 unhide
```

### Flow 3：使用者修改訂閱（Option 2 的 UX）

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

0:15–0:50  Re-scan 展示
           點 [Re-scan] → SSE streaming
           "Per-email 並行 extraction"
           "Privacy-by-design：body 不落地"

0:50–1:30  AI Section 8a
           點 [重新分析] → tool call streaming
           "Single-agent + 4 tools"

1:30–2:10  AI Section 8b
           "Trend agent，三段敘事"

2:10–2:50  Dashboard 編輯展示
           點訂閱 [編輯] → 改分類 → 立即更新
           "Hybrid data model：mutable state + immutable events"

2:50–3:30  /eval page
           "80 筆 golden set, 76% → 91%"

3:30–4:20  深入技術決策
           "為什麼 hybrid 不是 pure event sourcing"
           "為什麼 LLM 做 extract，code 做 normalize"
           "為什麼這專案不需要 RAG"

4:20–4:50  Privacy + 設計取捨
           "為什麼砍 chat UI"
           "為什麼不存 email body"

4:50–5:00  Phase 2 roadmap
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
│  │  ├── AI Section 8a「本週需要注意」  ◄── SSE streaming        │  │
│  │  ├── AI Section 8b「本月分析」      ◄── SSE streaming        │  │
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
│  │ Supabase     │  │  Gmail API                │  │ ┌─────────┐ │  │
│  │ Auth +       │  │      ↓                    │  │ │ Single  │ │  │
│  │ Google       │  │  Email Filter             │  │ │ Agent   │ │  │
│  │ OAuth        │  │      ↓                    │  │ └────┬────┘ │  │
│  └──────────────┘  │  HTML → Text (in-memory)  │  │      │      │  │
│                    │      ↓                    │  │ ┌────┴────┐ │  │
│                    │  ┌────────────────────┐   │  │ │  Tools  │ │  │
│                    │  │ Parallel LLM       │   │  │ ├─────────┤ │  │
│                    │  │ Extraction         │◄──┼──┤ │ query_  │ │  │
│                    │  │ (pMap, conc=10)    │   │  │ │ subs    │ │  │
│                    │  └─────────┬──────────┘   │  │ ├─────────┤ │  │
│                    │            ↓              │  │ │ calc_   │ │  │
│                    │  ┌────────────────────┐   │  │ │ trend   │ │  │
│                    │  │ Normalize          │   │  │ ├─────────┤ │  │
│                    │  │ (deterministic)    │   │  │ │ detect_ │ │  │
│                    │  └─────────┬──────────┘   │  │ │ anomaly │ │  │
│                    │            ↓              │  │ ├─────────┤ │  │
│                    │  ┌────────────────────┐   │  │ │ get_    │ │  │
│                    │  │ INSERT BillingEvent│   │  │ │ service │ │  │
│                    │  └─────────┬──────────┘   │  │ └─────────┘ │  │
│                    │            ↓              │  └─────┬───────┘  │
│                    │  ┌────────────────────┐   │        │          │
│                    │  │ UPSERT Subscription│   │        │          │
│                    │  │ (signal-aware)     │   │        │          │
│                    │  └────────────────────┘   │        │          │
│                    └──────────────────────────┘        │           │
│                                                         │           │
│  ┌──────────────────────────────────────────────────────┘           │
│  ↓                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Static Modules (in code, not DB)                            │  │
│  │ ┌──────────────────────┐  ┌────────────────────────────┐   │  │
│  │ │ SERVICE_REGISTRY     │  │ SERVICE_KNOWLEDGE          │   │  │
│  │ │ (normalization)      │  │ (plan tiers, pricing, etc) │   │  │
│  │ │ 15 services + alias  │  │ ~30KB inline               │   │  │
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
│  Supabase    │          │  Anthropic API  │  │  Gmail API │
│  (Postgres)  │          │  (Claude        │  │  (Google)  │
│              │          │   Sonnet)       │  │            │
└──────────────┘          └─────────────────┘  └────────────┘
```

### Data Schema (Prisma)

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  gmailToken    String?  // encrypted refresh token
  createdAt     DateTime @default(now())

  subscriptions Subscription[]
  billingEvents BillingEvent[]
  alerts        Alert[]
  agentTraces   AgentTrace[]
}

// 當前訂閱狀態：mutable，使用者可直接編輯
model Subscription {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])

  serviceName     String   // canonical ID (e.g. "cursor")
  displayName     String?  // 使用者可自訂顯示名

  // 當前金額（會被 ingestion UPSERT 更新）
  amount          Decimal
  currency        String   // TWD | USD | JPY
  amountInTwd     Decimal  // 統一換算
  cycle           String   // monthly | yearly | quarterly | one-time
  nextBillingDate DateTime?
  category        String   // entertainment | productivity | ai | cloud | comm | other

  // 狀態
  status          String   @default("active")  // active | cancelled | hidden
  cancelledAt     DateTime?
  hiddenAt        DateTime?

  // 來源
  source          String   @default("gmail")  // gmail | user_manual

  // Trial
  isTrial         Boolean  @default(false)
  trialEndsAt     DateTime?

  // 統計快取（從 BillingEvent 推算，可週期性更新）
  firstSeenAt     DateTime
  lastSeenAt      DateTime

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  billingEvents   BillingEvent[]

  @@unique([userId, serviceName])
  @@index([userId, status])
}

// 事件日誌：immutable，每封 email 一筆，永不修改
model BillingEvent {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])

  // 關聯到 Subscription（可能為 null，例如歷史 email Subscription 已刪）
  subscriptionId  String?
  subscription    Subscription? @relation(fields: [subscriptionId], references: [id])

  // Source metadata（最小化）
  gmailMessageId  String   @unique
  emailReceivedAt DateTime

  // LLM 抽出的事實
  rawServiceName  String   // LLM 原始輸出
  serviceName     String   // normalized canonical ID
  amount          Decimal
  currency        String
  amountInTwd     Decimal
  cycle           String
  emailSignalType String   // billing | trial_reminder | we_miss_you | price_change | renewal_notice | cancellation

  // Quality
  confidence      Float
  promptVersion   String

  createdAt       DateTime @default(now())

  @@index([userId, serviceName, emailReceivedAt(sort: Desc)])
  @@index([userId, emailReceivedAt])
}

model Alert {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  type        String   // upcoming_renewal | price_increase | idle | duplicate | trial_ending
  priority    String   // high | medium | low
  serviceName String
  payload     Json
  status      String   // active | dismissed | snoozed
  expiresAt   DateTime?
  createdAt   DateTime @default(now())

  @@index([userId, status])
}

model AgentTrace {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  section     String   // 8a | 8b
  steps       Json     // array of { tool, input, output, durationMs }
  totalTokens Int
  totalCostUsd Decimal
  status      String   // success | fallback | failed
  createdAt   DateTime @default(now())

  @@index([userId, createdAt])
}
```

### Ingestion Pipeline 流程（含 UPSERT 邏輯）

```
fetchGmailEmails(last 90 days)
        │
        ↓
filterByWhitelist + keywords
        │
        ↓
   [127 candidates]
        │
        ↓
┌─────────────────────────────────────┐
│ pMap with concurrency=10            │
│  for each email:                    │
│    htmlToText(body) [in-memory]     │
│    extract = await llmExtract(text) │
│    normalized = normalizeServiceName│
│    return { ...extract, normalized }│
│    [body GC'd here]                 │
└─────────────┬───────────────────────┘
              ↓
        [127 raw extractions]
              ↓
   filter out errors / null services
              ↓
┌─────────────────────────────────────┐
│ For each extraction:                │
│                                      │
│  1. INSERT BillingEvent              │
│     (immutable，永遠 INSERT)         │
│                                      │
│  2. UPSERT Subscription:             │
│     Find existing (userId,           │
│       serviceName)                   │
│     │                                │
│     ├─ Not exists:                  │
│     │   INSERT new Subscription     │
│     │   status='active'             │
│     │                                │
│     └─ Exists:                      │
│         IF emailReceivedAt > lastSeen│
│         AND signalType = 'billing'  │
│            OR 'price_change'        │
│         THEN UPDATE amount, cycle,  │
│              nextBillingDate,       │
│              lastSeenAt             │
│                                      │
│         IF signalType =             │
│           'cancellation'            │
│         THEN UPDATE status=         │
│              'cancelled'            │
│                                      │
│         (其他 signal type 只更新     │
│          lastSeenAt，不改金額)       │
└─────────────────────────────────────┘
              ↓
   Subscriptions table reflects current state
   BillingEvent table holds full history
```

### UPSERT Decision Logic（Pseudocode）

```typescript
async function upsertSubscription(event: BillingEventInput) {
  const existing = await db.subscription.findUnique({
    where: { userId_serviceName: { userId, serviceName } },
  });

  if (!existing) {
    // 新訂閱
    return db.subscription.create({
      data: {
        userId,
        serviceName: event.serviceName,
        amount: event.amount,
        currency: event.currency,
        amountInTwd: event.amountInTwd,
        cycle: event.cycle,
        category: event.category,
        nextBillingDate: event.nextBillingDate,
        isTrial: event.isTrial,
        trialEndsAt: event.trialEndsAt,
        firstSeenAt: event.emailReceivedAt,
        lastSeenAt: event.emailReceivedAt,
        status: "active",
      },
    });
  }

  // 既有訂閱：根據 signal type 決定更新策略
  const updates: Partial<Subscription> = {};

  // 永遠更新 lastSeenAt（如果這封 email 比較新）
  if (event.emailReceivedAt > existing.lastSeenAt) {
    updates.lastSeenAt = event.emailReceivedAt;
  } else {
    // email 比較舊，不要覆蓋當前狀態
    return existing;
  }

  // 根據 signal type 決定其他更新
  switch (event.emailSignalType) {
    case "billing":
    case "price_change":
    case "renewal_notice":
      updates.amount = event.amount;
      updates.amountInTwd = event.amountInTwd;
      updates.currency = event.currency;
      updates.cycle = event.cycle;
      updates.nextBillingDate = event.nextBillingDate;
      // 如果之前是 cancelled，新的 billing 出現代表又訂閱回來
      if (existing.status === "cancelled") {
        updates.status = "active";
        updates.cancelledAt = null;
      }
      break;

    case "cancellation":
      updates.status = "cancelled";
      updates.cancelledAt = event.emailReceivedAt;
      break;

    case "trial_reminder":
      // trial 提醒，更新 trial 狀態但不改金額
      updates.isTrial = true;
      updates.trialEndsAt = event.trialEndsAt;
      break;

    case "we_miss_you":
      // 不影響 subscription state，只記錄事件
      break;
  }

  return db.subscription.update({
    where: { id: existing.id },
    data: updates,
  });
}
```

### Agent 執行流程（Single-Agent + Tools）

```
Section [重新分析] 按鈕 → POST /api/analyze { section: "8a" | "8b" }
                                  │
                                  ↓
             ┌────────────────────────────────────────┐
             │  Build Agent Prompt                    │
             │  ─ System: section context             │
             │  ─ User: subscription summary stats    │
             │  ─ Tools: 4 tools available            │
             │  ─ Service Knowledge: inline ~30KB     │
             └─────────────────┬──────────────────────┘
                               ↓
             ┌────────────────────────────────────────┐
             │ Vercel AI SDK: streamText with tools   │
             │ maxSteps: 5                            │
             └──────────────┬─────────────────────────┘
                            ↓
                    ┌───────────────┐
                    │ LLM Reasoning │
                    └──────┬────────┘
                           ↓
                    ┌─────────────┐
                    │ Tool call?  │
                    └──┬───────┬──┘
                  yes  │       │  no
              ┌────────┘       └─────────────┐
              ↓                               ↓
        Call Tool:                      Final Output
        - query_subs → Subscription          │
        - calc_trend → BillingEvent          ↓
        - detect_anomaly                ┌──────────────────────┐
        - get_service_info              │ Structured JSON      │
              │                          │ (Zod validated)      │
              └─→ Result back ──────────►└─────────┬────────────┘
                  to LLM                           ↓
                                    ┌──────────────────────────┐
                                    │ Validation Pass?         │
                                    └──┬───────────────────┬───┘
                                  yes  │                no │
                                       ↓                   ↓
                                Stream to UI         Fallback Layer
                                                    (single-prompt → static)
                                                          │
                                                          ↓
                                                   Stream to UI
                                                          │
                                                          ↓
                                            Save AgentTrace to DB
```

### Tool 實作對照表

| Tool                               | 從哪裡查                      | 範例                                                           |
| ---------------------------------- | ----------------------------- | -------------------------------------------------------------- |
| `query_subscriptions(filter)`      | **Subscription table 直接讀** | `SELECT * WHERE userId=$1 AND status='active'`                 |
| `calculate_trend(service, months)` | **BillingEvent aggregate**    | `SELECT month, SUM(amount) FROM billing_events GROUP BY month` |
| `detect_anomalies(types)`          | 兩邊都用                      | duplicate 看 Subscription、price_change 看 BillingEvent        |
| `get_service_info(service)`        | **service-knowledge.ts**      | 純 in-memory module                                            |

### Tech Stack

| Layer       | Choice                       | 理由                 |
| ----------- | ---------------------------- | -------------------- |
| Framework   | Next.js 14 App Router        | 你的本業             |
| Language    | TypeScript                   | 你的本業             |
| Styling     | Tailwind + shadcn/ui         | 開發速度最快         |
| Database    | Supabase (Postgres)          | Auth + DB 一站搞定   |
| ORM         | Prisma                       | 你有經驗             |
| Auth        | Supabase Auth + Google OAuth | 內建 Gmail scope     |
| LLM         | Anthropic Claude Sonnet      | 中文表現好           |
| LLM SDK     | Vercel AI SDK                | streaming + tool use |
| Parallelism | p-map                        | 並行 extraction      |
| Charts      | recharts                     | React-native         |
| Deploy      | Vercel                       | 與 Next.js 配套      |

---

## Part 4：12 週每週計畫

### 🏗 Phase 1：基礎 + LLM 入門（Week 1–4）

**Week 1：Setup + Gmail OAuth**

| 天  | 任務                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------- |
| 1–2 | Next.js + Supabase + Prisma + Tailwind + shadcn 初始化、定義 v5 schema（Subscription + BillingEvent） |
| 3–4 | Google Cloud Console + OAuth + Supabase Auth 整合                                                     |
| 5   | Gmail API read-only，列最新 email subjects                                                            |

- **Deliverable**：登入後看到自己 Gmail 最新 email，schema migration 完成
- **預期痛點**：Gmail scope 設定、OAuth refresh token

---

**Week 2：Email Filtering + Service Normalization Module**

| 天  | 任務                                                                                   |
| --- | -------------------------------------------------------------------------------------- |
| 1   | 寄件者白名單 + 中英關鍵字過濾邏輯                                                      |
| 2   | HTML → plain text 處理（in-memory，不存）                                              |
| 3   | **Service Normalization Module**：定義 15 canonical services + aliases + senderDomains |
| 4   | `normalizeServiceName()` 三層策略 + 單元測試                                           |
| 5   | 跑自己 Gmail 看 filter precision 數字                                                  |

- **Deliverable**：
  - Filtering pipeline 跑通
  - `service-normalization.ts` 完整可單測
- **面試故事種子 D**：「LLM 做理解，code 做映射」

---

**Week 3：LLM Extraction 入門 + Per-Email Pipeline + UPSERT 🎓**

⚠️ **學習曲線最陡的一週**

| 天  | 任務                                                                                             | 學習重點            |
| --- | ------------------------------------------------------------------------------------------------ | ------------------- |
| 1–2 | **純學習** — Vercel AI SDK、Anthropic docs、structured output、寫 toy examples                   | LLM API、Zod schema |
| 3   | 設計完整 Zod schema（含 isTrial / emailSignalType / rawServiceName）                             | Prompt design       |
| 4   | 寫第一版 extraction prompt + 並行處理（pMap concurrency 10）                                     | Parallelism         |
| 5   | Pipeline 整合：filter → parallel extract → normalize → INSERT BillingEvent + UPSERT Subscription | Hybrid model 寫入   |

- **Deliverable**：
  - 端到端 ingestion pipeline 跑通
  - DB 裡 BillingEvent 和 Subscription 兩個 table 都有資料
- **如果 Day 5 跑不通**：延一週，後面 Week 12 縮短
- **面試故事種子**：「Per-email vs batch、Hybrid data model」

---

**Week 4：Eval Harness + 80 筆 Golden Set ⭐**

| 天  | 任務                                                                     |
| --- | ------------------------------------------------------------------------ |
| 1   | **學習** eval 概念：accuracy / precision / recall / F1 在 LLM 場景的定義 |
| 2–3 | 標註 80 筆 golden set（每服務 5–6 筆，涵蓋各 emailSignalType）           |
| 4   | 寫 eval script：per-field metric                                         |
| 5   | 跑 baseline、failure cases 分類                                          |

- **Deliverable**：
  - 80 筆 golden set + eval script
  - V1.0 baseline accuracy（預期 70–82%）
- **面試故事 A 誕生** 🎯
- **底線**：50 筆也可以，不延週

---

### 🧠 Phase 2：Tool Use + Agent（Week 5–8）

**Week 5：Prompt Iteration + Accuracy 提升**

| 天  | 任務                                          |
| --- | --------------------------------------------- |
| 1–2 | Few-shot examples 處理 failure cases          |
| 3   | Claude vs GPT-4o 比較 + 記錄                  |
| 4   | 迭代到 88%+ accuracy                          |
| 5   | **Blog Post #1 草稿**：Eval-driven extraction |

- **Deliverable**：accuracy 88%+、blog #1
- **面試故事 A 完整** 🎯

---

**Week 6：Service Knowledge Module + Tool Use 入門 🎓**

| 天  | 任務                                                                             | 學習重點                       |
| --- | -------------------------------------------------------------------------------- | ------------------------------ |
| 1   | 寫 `service-knowledge.ts`（15 服務的 plan / pricing / 漲價歷史）                 | —                              |
| 2–3 | **學習** tool use / function calling，寫 toy example                             | Tool schema、LLM tool decision |
| 4   | 實作 2 個 tools：`query_subscriptions`（從 Subscription 讀）+ `get_service_info` | —                              |
| 5   | CLI 測試 tool 整合                                                               | —                              |

- **Deliverable**：service-knowledge module + 2 working tools
- **面試故事種子**：「為什麼不用 RAG」

---

**Week 7：Single-Agent + Multi-Step Tool Use 🎓⭐**

⚠️ **第二陡的學習曲線**

| 天  | 任務                                                                              | 學習重點             |
| --- | --------------------------------------------------------------------------------- | -------------------- |
| 1–2 | **學習** Vercel AI SDK streamText + tools、max_steps、tool_choice                 | Multi-step reasoning |
| 3   | 加 2 個 tools：`calculate_trend`（從 BillingEvent aggregate）+ `detect_anomalies` | —                    |
| 4   | 實作 Anomaly analysis flow（給 8a）                                               | —                    |
| 5   | 實作 Trend analysis flow（給 8b）                                                 | Token cost 控制      |

- **Deliverable**：
  - `POST /api/analyze` 兩種 section 都能跑
  - CLI 端到端跑通
- **面試故事 B 誕生** 🎯
- **Plan B**：跑不通 → sequential function calls

---

**Week 8：Robustness + Buffer Week**

| 天  | 任務（on track）                           |
| --- | ------------------------------------------ |
| 1–2 | Tool failure / max step / timeout handling |
| 3   | 三層 fallback 機制                         |
| 4   | Agent trace logging                        |
| 5   | 簡單 trace viewer（dev 用）                |

如果落後：補完 Week 7 / 修 Week 4–5

- **Deliverable**：5 個失敗情境 handling、trace 可看
- **面試故事 B 完整**：error handling story

---

### 🎨 Phase 3：Dashboard 整合（Week 9–11）

**Week 9：Dashboard 骨架 + 編輯功能**

| 天  | 任務                                                                     |
| --- | ------------------------------------------------------------------------ |
| 1   | Design system + shadcn 客製化                                            |
| 2   | Layout：總覽卡 + 趨勢圖（讀 BillingEvent aggregate）                     |
| 3   | 分類 breakdown + 訂閱列表（讀 Subscription）                             |
| 4   | **編輯功能**：modal 修改 displayName / category、隱藏訂閱（直接 UPDATE） |
| 5   | Empty / loading / error states                                           |

- **Deliverable**：完整 dashboard UI（mock data + 真實編輯流）
- ⚡ Hybrid model 讓編輯功能簡單，這天應該很快
- **面試故事種子 E**：「Hybrid: mutable state + immutable events」

---

**Week 10：AI Sections + Streaming 🎓**

| 天  | 任務                                     | 學習重點 |
| --- | ---------------------------------------- | -------- |
| 1–2 | **學習** SSE / Vercel AI SDK streaming   | SSE 機制 |
| 3   | 8a「本週需要注意」串到 agent + streaming | —        |
| 4   | 8b「本月分析」串到 agent + streaming     | —        |
| 5   | Streaming progress text、結果 cache      | —        |

- **Deliverable**：兩個 AI section 真資料 streaming
- **面試故事 C 完整** 🎯
- **Plan B**：streaming 卡關 → 先做非 streaming 版本

---

**Week 11：Polish + 部署**

| 天  | 任務                                            |
| --- | ----------------------------------------------- |
| 1–2 | 自己 Gmail end-to-end，抓 bug                   |
| 3   | 找 1–2 個朋友壓測                               |
| 4   | Public `/eval` page + privacy policy page       |
| 5   | 部署 Vercel + custom domain + demo test account |

- **Deliverable**：穩定可公開 demo URL
- ⚠️ **不做新功能**

---

### 📦 Phase 4：Portfolio Packaging（Week 12）

**Week 12：履歷與面試準備**

| 天  | 任務                                                                                |
| --- | ----------------------------------------------------------------------------------- |
| 1   | GitHub README + 架構圖 + demo GIF                                                   |
| 2   | Blog Post #1 定稿（Eval-driven extraction）                                         |
| 3   | Blog Post #2 定稿（Single-agent + tool design + LLM/code 邊界 + Hybrid data model） |
| 4   | Demo video 錄製（5 分鐘腳本）                                                       |
| 5   | 五個故事 talking script、LinkedIn 更新、開始投履歷                                  |

- **Deliverable**：完整 portfolio package + 履歷投出
- ⚠️ **不寫 production code**

---

## Part 5：五個面試故事總覽

| 故事                          | 對應週次   | 核心 Talking Points                                                                                                                                       |
| ----------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Eval-driven Extraction** | Week 4–5   | 80 筆繁中 golden set、accuracy 提升路徑、failure pattern 分類、prompt versioning、model comparison                                                        |
| **B. Single-Agent + Tools**   | Week 7–8   | 為什麼不 multi-agent、tool design、為什麼不 RAG、production AI error handling、三層 fallback                                                              |
| **C. Decision-first AI UX**   | Week 9–10  | 為什麼砍 chat、structured output vs conversational、streaming UI 設計、product positioning                                                                |
| **D. LLM vs Code Boundary**   | Week 2 + 6 | Service normalization 用 code 不用 LLM、LLM 做理解 code 做映射、`get_email_context` 砍掉的 reasoning                                                      |
| **E. Hybrid Data Model**      | Week 1 + 9 | Subscription（mutable current state）+ BillingEvent（immutable event log）、為什麼不純 event sourcing、UPSERT 邏輯設計、privacy-by-design metadata 最小化 |

---

## Part 6：風險與 Plan B

| 風險                | 觸發點                | Plan B                                             |
| ------------------- | --------------------- | -------------------------------------------------- |
| LLM 入門卡關        | Week 3 Day 5 跑不通   | 延一週、Week 12 縮短                               |
| Golden set 標太慢   | Week 4 結束少於 80 筆 | 50 筆繼續走                                        |
| UPSERT 邏輯有 bug   | Week 3 結束           | 簡化只支援 billing + cancellation 兩種 signal type |
| Single-agent 跑不通 | Week 7 Day 3 仍卡     | 降級 sequential function calls                     |
| Streaming 卡關      | Week 10 Day 3 仍卡    | 先做非 streaming 版本                              |
| 整體落後 2 週       | Week 8 結束           | 砍 8b，只保留 8a                                   |
| 整體落後 4 週       | Week 10 結束          | demo 延到 Month 4，先投履歷                        |

---

## Part 7：v5 vs v4 主要變動

| 項目                       | v4（純 Event Sourcing）                 | v5（Hybrid）                                         |
| -------------------------- | --------------------------------------- | ---------------------------------------------------- |
| 資料模型                   | Extraction（事件流） + UserOverride     | **Subscription（mutable） + BillingEvent（events）** |
| 「當前訂閱」query          | DISTINCT ON event log + apply overrides | **直接 SELECT Subscription**                         |
| 使用者修改                 | 寫 UserOverride，query 時 merge         | **直接 UPDATE Subscription**                         |
| Ingestion 邏輯             | 純 INSERT                               | **INSERT BillingEvent + UPSERT Subscription**        |
| Tool `query_subscriptions` | 複雜：merge events + overrides          | **簡單：SELECT Subscription**                        |
| Dashboard 編輯 UX          | 多一層抽象                              | **直觀：UPDATE 一行**                                |
| 心智負擔                   | 高（每次都要想 derive）                 | **低（讀寫都直接）**                                 |
| 時序分析                   | 從 event log                            | **從 BillingEvent（一樣）**                          |
| 漲價偵測                   | 從 event log                            | **從 BillingEvent（一樣）**                          |
| 面試故事                   | "Pure event sourcing"                   | **"Hybrid: 務實的取捨"**                             |

---

這份是 ready-to-execute 的 v5。要繼續往下嗎？我可以：

1. 拆 Week 1 Day 1 具體開工任務（repo init、Supabase setup、第一個 commit、第一個 schema migration）
2. 把 15 個 canonical services 完整 SERVICE_REGISTRY 列出（含台灣特色服務）
3. 寫 BillingEvent / Subscription Zod schema 和 UPSERT 邏輯的詳細 TypeScript 實作
4. 設計 onboarding privacy notice 文案 + privacy policy page 內容
