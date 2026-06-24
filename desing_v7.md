# AI Subscription Manager — v7 完整規劃

**v7 變動**：Subscription derive 從 incremental UPSERT 改為 replay-from-scratch（pure fold over BillingEvent log）。其他部分沿用 v6。詳見 Part 7a。

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

### F2 — LLM Extraction Pipeline + Eval Harness ⭐

- **Per-email 並行 extraction**（pMap concurrency 5–10）
- Vercel AI SDK + Claude Sonnet，structured output (Zod schema)
- **LLM 自己判斷 `isSubscriptionRelated`**，false 直接 skip（不入庫、不存任何欄位、只 log）
- 訂閱信抽取欄位：
  - 訂閱資訊：rawServiceName、amount、currency、cycle、nextBillingDate、category
  - Trial 訊號:isTrial、trialEndsAt
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

- **Subscription**：當前狀態 table，mutable，使用者可編輯
  - 一個 service 一筆紀錄
  - Status：active / cancelled / hidden
  - 使用者可修改：displayName、category、status
- **BillingEvent**：事件日誌，immutable，永不修改
  - 每封 email 一筆（除非 LLM 判定不是訂閱）
  - 保留 LLM 原始輸出（rawServiceName、promptVersion）
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

### ❌ 明確不做（v6 確認版）

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
- Normalize Tier 3 senderDomain match（Week 2 不做，看後續需求）
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
        "並行 LLM 判讀... 處理 50/89"
        "辨識為訂閱 14 封、非訂閱 75 封"
        "Normalize 與 UPSERT 訂閱... 12 個服務"
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
  │     展開 detail
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
        │   ├─→ 看 BillingEvent 歷史（金額變化）
        │   ├─→ [編輯] → 改 displayName / category
        │   └─→ [隱藏] → status='hidden'
        │
        └─→ 已隱藏訂閱可在 [設定] 頁面 unhide
```

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

0:15–0:50  Re-scan 展示
           點 [Re-scan] → SSE streaming
           "Per-email 並行 LLM 判讀"
           "Privacy-by-design：body 不落地"

0:50–1:30  AI Section 8a
           點 [重新分析] → tool call streaming

1:30–2:10  AI Section 8b
           三段敘事 streaming

2:10–2:50  Dashboard 編輯展示
           點訂閱 [編輯] → 改分類 → 立即更新
           "Hybrid data model"

2:50–3:30  /eval page
           "80 筆 golden set, 76% → 91%"
           "含 false positive 測試"

3:30–4:30  深入技術決策（多選 2–3 個）
           - "為什麼 hybrid 不是 pure event sourcing"
           - "為什麼 LLM 做判斷，code 做 normalize"
           - "為什麼這專案不需要 RAG"
           - "為什麼不存 confidence"
           - "為什麼 normalize 只做 exact match"

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
│  │ Supabase     │  │  Gmail API (q= filter)   │  │ ┌─────────┐ │  │
│  │ Auth +       │  │      ↓                    │  │ │ Single  │ │  │
│  │ Google       │  │  Minimal Blacklist        │  │ │ Agent   │ │  │
│  │ OAuth        │  │      ↓                    │  │ └────┬────┘ │  │
│  └──────────────┘  │  HTML → Text (in-memory)  │  │      │      │  │
│                    │      ↓                    │  │ ┌────┴────┐ │  │
│                    │  ┌────────────────────┐   │  │ │  Tools  │ │  │
│                    │  │ Parallel LLM       │   │  │ ├─────────┤ │  │
│                    │  │ (pMap, conc=10)    │◄──┼──┤ │ query_  │ │  │
│                    │  └─────────┬──────────┘   │  │ │ subs    │ │  │
│                    │            ↓              │  │ ├─────────┤ │  │
│                    │  isSubscriptionRelated?   │  │ │ calc_   │ │  │
│                    │      no → skip+log        │  │ │ trend   │ │  │
│                    │      yes ↓                │  │ ├─────────┤ │  │
│                    │  ┌────────────────────┐   │  │ │ detect_ │ │  │
│                    │  │ Normalize          │   │  │ │ anomaly │ │  │
│                    │  │ (Tier 1 + slugify) │   │  │ ├─────────┤ │  │
│                    │  └─────────┬──────────┘   │  │ │ get_    │ │  │
│                    │            ↓              │  │ │ service │ │  │
│                    │  ┌────────────────────┐   │  │ └─────────┘ │  │
│                    │  │ INSERT BillingEvent│   │  └─────┬───────┘  │
│                    │  └─────────┬──────────┘   │        │          │
│                    │            ↓              │        │          │
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
│  Supabase    │          │  Anthropic API  │  │  Gmail API │
│  (Postgres)  │          │  (Claude Sonnet)│  │  (Google)  │
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

  // 統計（從 BillingEvent 推算）
  firstSeenAt     DateTime
  lastSeenAt      DateTime

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  billingEvents   BillingEvent[]

  @@unique([userId, serviceName])
  @@index([userId, status])
}

// 事件日誌：immutable，每封 email 一筆（除非 LLM 判定非訂閱）
model BillingEvent {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])

  // 關聯到 Subscription（可能為 null：例如 normalize fallback 但尚未對應）
  subscriptionId  String?
  subscription    Subscription? @relation(fields: [subscriptionId], references: [id])

  // Source metadata（最小化）
  gmailMessageId  String   @unique
  emailReceivedAt DateTime

  // LLM 抽出的事實
  rawServiceName  String   // LLM 原始輸出（normalize alias 來源）
  serviceName     String   // normalize 後的 canonical ID
  amount          Decimal
  currency        String
  amountInTwd     Decimal
  cycle           String
  emailSignalType String   // billing | trial_reminder | we_miss_you | price_change | renewal_notice | cancellation

  // 追蹤
  promptVersion   String   // 留著做 re-extract 比較用

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
  steps       Json
  totalTokens Int
  totalCostUsd Decimal
  status      String   // success | fallback | failed
  createdAt   DateTime @default(now())

  @@index([userId, createdAt])
}
```

### Extraction Zod Schema

```typescript
const ExtractionSchema = z.object({
  // LLM 自判閘門
  isSubscriptionRelated: z.boolean(),

  // 不是訂閱時，這個必填說明原因（debug 用）
  notSubscriptionReason: z
    .enum(["one_time_purchase", "promotional", "service_unrelated", "unclear"])
    .optional(),

  // 是訂閱時抽取的欄位
  rawServiceName: z.string().optional(),
  amount: z.number().optional(),
  currency: z.enum(["TWD", "USD", "JPY", "EUR"]).optional(),
  cycle: z.enum(["monthly", "yearly", "quarterly", "one-time"]).optional(),
  nextBillingDate: z.string().optional(), // ISO date string
  category: z
    .enum(["entertainment", "productivity", "ai", "cloud", "comm", "other"])
    .optional(),
  emailSignalType: z
    .enum([
      "billing",
      "trial_reminder",
      "we_miss_you",
      "price_change",
      "renewal_notice",
      "cancellation",
    ])
    .optional(),
  isTrial: z.boolean().optional(),
  trialEndsAt: z.string().optional(),
});
```

### Ingestion Pipeline 流程

```
fetchGmailEmails:
  await gmail.users.messages.list({
    q: 'subject:(invoice OR receipt OR subscription OR 收據 OR 發票
         OR 訂閱 OR 扣款) newer_than:90d',
    maxResults: 500,
  })
        │
        ↓
   [~150 candidates from Gmail]
        │
        ↓
minimalBlacklistFilter
  (calendar invite / password reset / unsubscribe)
        │
        ↓
   [~120 after blacklist]
        │
        ↓
┌─────────────────────────────────────┐
│ pMap with concurrency=10            │
│  for each email:                    │
│    htmlToText(body) [in-memory]     │
│    extraction = await llmExtract    │
│    [body GC'd here]                 │
│                                     │
│    if !isSubscriptionRelated:       │
│      log.info('Skipped', reason)    │
│      return null                    │
│                                     │
│    if !rawServiceName || !amount:   │
│      log.warn('Missing fields')     │
│      return null                    │
│                                     │
│    normalized = normalizeServiceName│
│    return { ...extraction,          │
│              serviceName: normalized}│
└─────────────┬───────────────────────┘
              ↓
        [filtered subscription extractions]
              ↓
Bulk INSERT BillingEvent (immutable, subscriptionId=null)
              ↓
collect affected = distinct(inserts.serviceName)
              ↓
for each affected serviceName (per-service, not per-event):
  ┌────────────────────────────────────────┐
  │ SELECT all events for (userId, svc)    │
  │   ORDER BY emailReceivedAt ASC         │
  │            ↓                            │
  │ deriveSubscriptionState(events) [pure] │
  │            ↓                            │
  │ UPSERT Subscription (full replace)     │
  │            ↓                            │
  │ UPDATE BillingEvent SET subscriptionId │
  │   WHERE subscriptionId IS NULL         │
  └────────────────────────────────────────┘
              ↓
   Pipeline complete
   - BillingEvent: immutable 事件日誌（source of truth）
   - Subscription: derived 當前狀態 cache
```

### Derive Subscription State (Replay-from-Scratch)

**核心原則**：Subscription 是 BillingEvent log 的 derived view。每次 ingest 結束後，對每個 affected service 從頭重新 fold 出最終 Subscription state，UPSERT 進去。**不在 ingestion 時做 incremental mutation**。

**為什麼這樣做**：

- **Idempotent**：同樣的 BillingEvent log → 同樣的 Subscription state。修了 derive 邏輯 bug 後，再點一次 Ingest 就會自動修復所有 Subscription，不需要寫遷移腳本。
- **無時序邊界**：不需要 v6 那條「event 比 lastSeenAt 舊就 skip」的時序判斷 —— fold 前先 sort，亂序到達不會影響結果。
- **Pure function 好測**：derive logic 不碰 DB，unit test 可以用合成 event 序列直接驗 cancellation → re-active 等場景。

**Pseudocode**：

```typescript
// 純函式：從 sorted events 算出最終 state，不碰 DB
function deriveSubscriptionState(
  events: BillingEvent[],
): DerivedState | null {
  if (events.length === 0) return null;
  const sorted = [...events].sort(
    (a, b) => a.emailReceivedAt.getTime() - b.emailReceivedAt.getTime(),
  );

  const state: DerivedState = {
    serviceName: sorted[0].serviceName,
    amount: 0,
    currency: "TWD",
    amountInTwd: 0,
    cycle: "monthly",
    category: "other",
    status: "active",
    cancelledAt: null,
    isTrial: false,
    trialEndsAt: null,
    nextBillingDate: null,
    firstSeenAt: sorted[0].emailReceivedAt,
    lastSeenAt: sorted[sorted.length - 1].emailReceivedAt,
  };

  for (const e of sorted) {
    switch (e.emailSignalType) {
      case "billing":
      case "price_change":
      case "renewal_notice":
        state.amount = e.amount;
        state.amountInTwd = e.amountInTwd;
        state.currency = e.currency;
        state.cycle = e.cycle;
        if (e.nextBillingDate) state.nextBillingDate = e.nextBillingDate;
        if (state.status === "cancelled") {
          state.status = "active";
          state.cancelledAt = null;
        }
        break;

      case "cancellation":
        state.status = "cancelled";
        state.cancelledAt = e.emailReceivedAt;
        break;

      case "trial_reminder":
        state.isTrial = true;
        if (e.trialEndsAt) state.trialEndsAt = e.trialEndsAt;
        break;

      case "we_miss_you":
        // 不影響 state
        break;
    }
  }
  return state;
}

// I/O orchestrator：對 affected services 各跑一次 query → derive → UPSERT
async function upsertSubscriptionsForServices(
  userId: string,
  serviceNames: Iterable<string>,
): Promise<number> {
  let upsertedCount = 0;
  for (const serviceName of serviceNames) {
    const events = await db.billingEvent.findMany({
      where: { userId, serviceName },
      orderBy: { emailReceivedAt: "asc" },
    });
    const state = deriveSubscriptionState(events);
    if (!state) continue;

    const sub = await db.subscription.upsert({
      where: { userId_serviceName: { userId, serviceName } },
      create: { ...state, userId, source: "gmail" },
      update: state,
    });

    // Backfill BillingEvent.subscriptionId for events still missing the FK
    await db.billingEvent.updateMany({
      where: { userId, serviceName, subscriptionId: null },
      data: { subscriptionId: sub.id },
    });

    upsertedCount += 1;
  }
  return upsertedCount;
}
```

**Trigger 點**：`ingestEmails()` 在 `createMany(BillingEvent)` 之後執行：

```typescript
const affected = new Set(inserts.map((i) => i.serviceName));
const subscriptionsUpserted = await upsertSubscriptionsForServices(
  userId,
  affected,
);
```

**只 re-derive 這次有新 event 的 service**。其他 Subscription 的 BillingEvent log 沒變，replay 結果一定一樣，跑了等於白跑。

**未來擴展（Tier 1 escape hatch）**：當單 service events 超過 ~1000 筆（>5 年深度），可在 Subscription 加 `lastDerivedAt` checkpoint 欄位，改成 incremental fold（`(prevState, newEvents) => state`）。derive 是純函式，這個升級不需要動 ingestion 邏輯，預估 1 天工作量。

### Normalization Module

```typescript
// src/lib/service-normalization.ts

type ServiceDefinition = {
  id: string;
  displayName: string;
  category:
    | "entertainment"
    | "productivity"
    | "ai"
    | "cloud"
    | "comm"
    | "other";
  aliases: string[];
};

// Week 2: 只填 canonical IDs，aliases 由 Week 5 反推填入
export const SERVICE_REGISTRY: Record<string, ServiceDefinition> = {
  cursor: {
    id: "cursor",
    displayName: "Cursor",
    category: "ai",
    aliases: [], // Week 5 backfill
  },
  // ... 其他 14 個 services
};

export function normalizeServiceName(rawServiceName: string): {
  canonicalId: string;
  matched: boolean;
} {
  const normalized = rawServiceName.trim().toLowerCase();

  // Tier 1: exact alias match
  for (const [id, def] of Object.entries(SERVICE_REGISTRY)) {
    if (def.aliases.some((a) => a.toLowerCase() === normalized)) {
      return { canonicalId: id, matched: true };
    }
  }

  // Fallback: slugify
  return {
    canonicalId: slugify(rawServiceName),
    matched: false,
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}
```

### Tool 實作對照表

| Tool                               | 從哪裡查                                                            |
| ---------------------------------- | ------------------------------------------------------------------- |
| `query_subscriptions(filter)`      | **Subscription table 直接讀**                                       |
| `calculate_trend(service, months)` | **BillingEvent aggregate**                                          |
| `detect_anomalies(types)`          | 兩邊都用（duplicate 看 Subscription、price_change 看 BillingEvent） |
| `get_service_info(service)`        | **service-knowledge.ts** 純 in-memory                               |

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

| 天  | 任務                                                                   |
| --- | ---------------------------------------------------------------------- |
| 1–2 | Next.js + Supabase + Prisma + Tailwind + shadcn 初始化、定義 v6 schema |
| 3–4 | Google Cloud Console + OAuth + Supabase Auth 整合                      |
| 5   | Gmail API read-only，列最新 email subjects                             |

- **Deliverable**：登入後看到自己 Gmail 最新 email，schema migration 完成
- **預期痛點**：Gmail scope 設定、OAuth refresh token

---

**Week 2：極簡 Pipeline 骨架**

| 天  | 任務                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------- |
| 1   | Gmail API 整合（含 `q=` server-side filter）+ 30 行 minimalBlacklistFilter + HTML→text               |
| 2   | In-memory pipeline 結構（filter → 預留 LLM hook → normalize → DB）                                   |
| 3   | `normalizeServiceName()` 函式：**只做 Tier 1 + slugify fallback**，SERVICE_REGISTRY 空殼，unit tests |
| 4   | `processEmail()` skeleton + UPSERT 邏輯（含 signal type switch）                                     |
| 5   | 整合測試 + 跑自己 Gmail 看 filter 通過量                                                             |

- **Deliverable**：
  - Pipeline 端到端結構完整（LLM 部分用 dummy 取代）
  - `service-normalization.ts` 函式骨架可單測
  - `upsertSubscription()` 邏輯實作完成
- **面試故事種子**：「LLM 做理解，code 做映射」+「極簡 filter」

---

**Week 3：LLM Extraction 入門 + isSubscriptionRelated 自判 🎓**

⚠️ **學習曲線最陡的一週**

| 天  | 任務                                                                           | 學習重點            |
| --- | ------------------------------------------------------------------------------ | ------------------- |
| 1–2 | **純學習** — Vercel AI SDK、Anthropic docs、structured output、寫 toy examples | LLM API、Zod schema |
| 3   | 設計 ExtractionSchema（含 isSubscriptionRelated）+ 寫第一版 prompt             | Prompt design       |
| 4   | 並行處理（pMap concurrency 10）+ 整合 processEmail                             | Parallelism         |
| 5   | 跑自己 Gmail + 寫 `analyze-raw-service-names.ts` script 看 rawServiceName 分布 | —                   |

- **Deliverable**：
  - 端到端 ingestion pipeline 跑通
  - DB 有 BillingEvent + Subscription
  - rawServiceName 分布報告
- **如果 Day 5 跑不通**：延一週，後面 Week 12 縮短
- **面試故事種子**：「Per-email 並行 + LLM 自判 isSubscriptionRelated」

---

**Week 4：Eval Harness + 80 筆 Golden Set ⭐**

| 天  | 任務                                                                         |
| --- | ---------------------------------------------------------------------------- |
| 1   | **學習** eval 概念：accuracy / precision / recall / F1 在 LLM 場景的定義     |
| 2–3 | 標註 80 筆 golden set（含 false positive cases：訂單 / 行銷信 / 密碼重設）   |
| 4   | 寫 eval script：per-field metric + isSubscriptionRelated 的 precision/recall |
| 5   | 跑 baseline、failure cases 分類                                              |

- **Deliverable**：
  - 80 筆 golden set + eval script
  - V1.0 baseline accuracy（預期 70–82%）
- **面試故事 A 誕生** 🎯
- **底線**：50 筆也可以，不延週

---

### 🧠 Phase 2：Tool Use + Agent（Week 5–8）

**Week 5：Prompt Iteration + Normalization Backfill**

| 天  | 任務                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2 | Few-shot examples 處理 failure cases，包含 false positive 改進                                                                                              |
| 3   | Claude vs GPT-4o 比較 + 記錄                                                                                                                                |
| 4   | 迭代到 88%+ accuracy                                                                                                                                        |
| 5   | **Normalization backfill**：根據 LLM 真實 rawServiceName 反推 aliases，寫 backfill script 回填歷史 BillingEvent + Subscription 合併 + **Blog Post #1 草稿** |

- **Deliverable**：
  - accuracy 88%+
  - SERVICE_REGISTRY 完整 aliases（從真實資料反推）
  - Backfill 完成
  - Blog #1
- **面試故事 A 完整** 🎯
- **面試故事 D 完整**：LLM 做理解、code 做映射、aliases backfill 流程

---

**Week 6：Service Knowledge Module + Tool Use 入門 🎓**

| 天  | 任務                                                             | 學習重點                       |
| --- | ---------------------------------------------------------------- | ------------------------------ |
| 1   | 寫 `service-knowledge.ts`（15 服務的 plan / pricing / 漲價歷史） | —                              |
| 2–3 | **學習** tool use / function calling，寫 toy example             | Tool schema、LLM tool decision |
| 4   | 實作 2 個 tools：`query_subscriptions` + `get_service_info`      | —                              |
| 5   | CLI 測試 tool 整合                                               | —                              |

- **Deliverable**：service-knowledge module + 2 working tools
- **面試故事種子**：「為什麼不用 RAG」

---

**Week 7：Single-Agent + Multi-Step Tool Use 🎓⭐**

⚠️ **第二陡的學習曲線**

| 天  | 任務                                                                           | 學習重點             |
| --- | ------------------------------------------------------------------------------ | -------------------- |
| 1–2 | **學習** Vercel AI SDK streamText + tools、max_steps、tool_choice              | Multi-step reasoning |
| 3   | 加 2 個 tools：`calculate_trend`（BillingEvent aggregate）+ `detect_anomalies` | —                    |
| 4   | 實作 Anomaly analysis flow（給 8a）                                            | —                    |
| 5   | 實作 Trend analysis flow（給 8b）                                              | Token cost 控制      |

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
- ⚡ Hybrid model 讓編輯功能簡單
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

| 天  | 任務                                                                                           |
| --- | ---------------------------------------------------------------------------------------------- |
| 1   | GitHub README + 架構圖 + demo GIF                                                              |
| 2   | Blog Post #1 定稿（Eval-driven extraction）                                                    |
| 3   | Blog Post #2 定稿（Single-agent + tool design + LLM/code 邊界 + Hybrid data model + 設計取捨） |
| 4   | Demo video 錄製（5 分鐘腳本）                                                                  |
| 5   | 五個故事 talking script、LinkedIn 更新、開始投履歷                                             |

- **Deliverable**：完整 portfolio package + 履歷投出
- ⚠️ **不寫 production code**

---

## Part 5：五個面試故事總覽

| 故事                                        | 對應週次       | 核心 Talking Points                                                                                                                                                                      |
| ------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Eval-driven Extraction**               | Week 4–5       | 80 筆繁中 golden set（含 false positive cases）、accuracy 提升路徑、failure pattern 分類、prompt versioning、model comparison                                                            |
| **B. Single-Agent + Tools**                 | Week 7–8       | 為什麼不 multi-agent、tool design、為什麼不 RAG、production AI error handling、三層 fallback                                                                                             |
| **C. Decision-first AI UX**                 | Week 9–10      | 為什麼砍 chat、structured output vs conversational、streaming UI 設計、product positioning                                                                                               |
| **D. LLM vs Code Boundary**                 | Week 2 + 5 + 6 | LLM 做理解（isSubscriptionRelated 判斷）、code 做映射（exact match normalize）、aliases 反推 backfill、`get_email_context` 砍掉、normalize 為什麼不做 fuzzy match、confidence 為什麼不存 |
| **E. Hybrid Data Model & Design Restraint** | Week 1 + 9     | Subscription（mutable）+ BillingEvent（immutable）、為什麼不純 event sourcing、UPSERT 邏輯、privacy-by-design metadata 最小化、12 週內砍掉 50% 初始設計的過程                            |

---

## Part 6：風險與 Plan B

| 風險                           | 觸發點                        | Plan B                                             |
| ------------------------------ | ----------------------------- | -------------------------------------------------- |
| LLM 入門卡關                   | Week 3 Day 5 跑不通           | 延一週、Week 12 縮短                               |
| Golden set 標太慢              | Week 4 結束少於 80 筆         | 50 筆繼續走                                        |
| `isSubscriptionRelated` 效果差 | Week 4 eval false positive 高 | Week 5 加 sender whitelist 補強                    |
| UPSERT 邏輯有 bug              | Week 3 結束                   | 簡化只支援 billing + cancellation 兩種 signal type |
| Normalize 反推太慢             | Week 5 Day 5 沒做完           | 接受 v1 normalize 不完美，Week 11 polish 時再補    |
| Single-agent 跑不通            | Week 7 Day 3 仍卡             | 降級 sequential function calls                     |
| Streaming 卡關                 | Week 10 Day 3 仍卡            | 先做非 streaming 版本                              |
| 整體落後 2 週                  | Week 8 結束                   | 砍 8b，只保留 8a                                   |
| 整體落後 4 週                  | Week 10 結束                  | demo 延到 Month 4，先投履歷                        |

---

## Part 7a：v7 vs v6 主要變動

| 項目                          | v6                                                            | v7                                                                                          |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Subscription derive 策略      | Incremental UPSERT（mutation + signal-type switch）           | **Replay-from-scratch（pure fold over sorted events）**                                     |
| Time-travel 邊界判斷          | 規則 1：`event < lastSeenAt` 就 skip                          | **不需要**（fold 前先 sort，亂序到達結果一致）                                              |
| Subscription state 可重建性   | 不可逆（mutate 之後失去原始事件）                             | **可隨時 rebuild**（BillingEvent 是 source of truth、derive 純函式）                        |
| Derive trigger 粒度           | Per-event（每筆 BillingEvent 一次）                           | **Per-service per ingest**（一次 ingest 對 affected services 各 fold 一次）                 |
| Derive 邏輯可測性             | mutation + DB I/O 混在一起，難純測                            | **pure function 直接吃合成 event 序列**，cancellation/re-active 等 case 用 unit test 完整覆蓋 |
| Derive bug 修復成本           | 修 code + 寫遷移腳本回填                                      | **修 code + 點一次 Ingest** 即自動修復所有 Subscription                                     |
| 面試故事 E                    | Hybrid model + UPSERT 邏輯                                    | **強化：replay vs incremental 的設計取捨、未來 snapshot escape hatch**                      |

---

## Part 7b：v6 vs v5 主要變動

| 項目                         | v5                                   | v6                                                                  |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| Filter 策略                  | 詳盡 whitelist + keyword             | **Gmail q= filter + 30 行 minimal blacklist**                       |
| Sender whitelist             | Week 2 收集 30 個服務                | **完全不做（用 Gmail query 取代）**                                 |
| Keyword regex 列表           | 維護中英雙語清單                     | **完全不做（用 Gmail query 取代）**                                 |
| Normalize tiers              | 3 層（exact + fuzzy + senderDomain） | **2 層（exact + slugify fallback）**                                |
| SERVICE_REGISTRY 內容        | Week 2 起步版（部分 aliases）        | **Week 2 空殼，Week 5 反推填入**                                    |
| LLM extraction confidence    | 單一 score 欄位                      | **完全不存**                                                        |
| Multi-axis confidence        | 提及作為選項                         | **完全不做**                                                        |
| BillingEvent.confidence      | 有欄位                               | **砍除**                                                            |
| `isSubscriptionRelated` 處理 | 寫進 BillingEvent                    | **不入庫，只 log**                                                  |
| 面試故事 D                   | LLM/code 邊界                        | **強化：含「不存 confidence」、「不做 fuzzy match」的設計取捨故事** |
| 面試故事 E                   | Hybrid data model                    | **強化：含「12 週砍掉 50% 設計」的 design restraint 敘事**          |

---

## Part 8：v7 設計哲學總結

整份 v7 規劃體現兩個一致原則：

1. **Defer commitment until you have evidence**（沿用 v6）
2. **State should be derivable, not mutable**（v7 新增）

| 領域                  | 應用                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Filter 設計           | Gmail query 已過濾，application 端只擋極端 case                                                                     |
| Normalization         | 函式骨架先寫，aliases 等 LLM 跑完反推                                                                               |
| Confidence            | 不存，因為所有 confidence-based 決策都被 schema 結構涵蓋                                                            |
| Data model            | Hybrid 而非 pure event sourcing（dashboard 直查 Subscription 不用 aggregate；歷史保留在 BillingEvent）              |
| **Subscription derive** | **Replay-from-scratch**：不存中間狀態的轉換邏輯，state 是 events 的 pure function。Bug 可修復、亂序輸入容錯、好測 |
| Architecture          | Single-agent 而非 multi-agent（scope 不需要）                                                                       |
| RAG                   | 不用，因為知識量太小                                                                                                |
| Chat UI               | 不做，因為和 decision-first positioning 衝突                                                                        |

**這份規劃的最大價值不是它做了什麼，而是它選擇不做什麼**。每個被砍掉的功能都對應一個可講的設計取捨。

---

這份是 ready-to-execute 的 v7 final。要繼續往下嗎？我可以：

1. 拆 Week 1 Day 1 具體開工任務（明天就能開始）
2. 把 15 個 canonical services 完整 SERVICE_REGISTRY 草稿列出
3. 設計 Week 4 golden set 80 筆的標註模板（含 false positive cases）
4. 寫 ExtractionSchema 的完整 prompt 設計（含 isSubscriptionRelated 判斷的 instructions）
