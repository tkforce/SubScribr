# Week 3 — LLM Extraction Pipeline (Design Spec)

- **Date**: 2026-05-27
- **Phase**: v7 Week 3
- **Goal**: 把 ingestion pipeline 裡的 `extractDummy()` 換成真實 LLM extraction，建立 prompt iteration 的快速 dev loop，產出 Week 5 反推 aliases 所需的 rawServiceName 分布報告。
- **Non-goal**: Eval harness（Week 4）、few-shot prompting（Week 5）、tool use（Week 6-7）、streaming（Week 10）。

---

## 1. 設計決定

| 議題 | 決定 | 理由 |
|---|---|---|
| Dev iteration 資料來源 | `sampleEmail/*.json` fixture | Deterministic、可重現、prompt iteration loop 秒級、輸出可 commit 看歷史；不污染 DB、不需要 OAuth |
| LLM SDK | Vercel AI SDK (`ai` + `@ai-sdk/google`) | Provider-agnostic，未來換 OpenAI / local 只動單一 `getModel()` 函式；`generateObject` + Zod schema 一條龍 |
| Model (Week 3 baseline) | `gemini-2.5-flash` | 中文表現強、結構化輸出 native 支援、context 1M token、價格極低（200 封 fixture 一次 ≈ $0.05 USD，free tier 內可能不收費）；Week 4 eval 可換 model 比較 |
| Failure handling | Skip + log，不 retry | Week 4 eval 的 baseline 不被 retry 污染；prompt 變動不會引發預期外重試風暴；簡單可預測 |
| Concurrency | `p-map` concurrency=10 | 有 backpressure，不會一次 burst 200 個 request 撞 rate limit |
| Day 5 distribution report | CLI script over fixture | Prompt iteration loop 秒級；輸出 markdown 可 commit；`git diff` 兩份報告看變化 |
| Prompt 策略 | Zero-shot baseline | 留 baseline → few-shot 提升曲線給面試故事 A；Week 5 看完真實 failure pattern 再針對性加 few-shot 才有意義 |
| Week 3 交付範圍 | CLI script + ingestion pipeline 都要 | Dashboard 端到端可 demo；Week 4 eval 跑 fixture 不重複工 |

---

## 2. 架構與檔案改動

### 新增 / 改動清單

| 檔案 | 動作 | 角色 |
|---|---|---|
| `src/lib/llm.ts` | 新增 | Vercel AI SDK provider 設定，匯出 `getModel()` |
| `src/lib/extraction.ts` | 改 | 移除 `extractDummy()`，新增 `async llmExtract(email): Promise<Extraction \| null>`；schema 微調 |
| `src/lib/ingestion.ts` | 改 | `processEmail()` 改 async；ingestion 從 for loop 改 `p-map` concurrency=10 |
| `src/lib/extraction.test.ts` | 新增 | 用 `MockLanguageModelV2` 的 unit tests，覆蓋 4 種 case + schema 驗證 |
| `src/lib/ingestion.test.ts` | 新增 | `processEmail()` async path 測試（mock `llmExtract`） |
| `scripts/analyze-raw-service-names.ts` | 新增 | 讀 fixture、跑全部 extraction、輸出 markdown 報告 |
| `docs/extractions/.gitkeep` | 新增 | 報告輸出目錄 |
| `package.json` | 改 | 加 `ai`、`@ai-sdk/google`、`p-map`、`tsx` deps；加 `analyze:names` script |
| `.env.example` | 改 | 加 `GOOGLE_GENERATIVE_AI_API_KEY` |

### Provider 設定（`src/lib/llm.ts`）

```typescript
import { google } from "@ai-sdk/google";

export function getModel() {
  return google("gemini-2.5-flash");
}
```

未來換 OpenAI / Gemini Pro / local Ollama 只動這個檔案。

### Ingestion loop 改寫（示意）

```typescript
import pMap from "p-map";

// 在 ingestEmails() 裡（取代現在的 for loop）
const results = await pMap(
  emails,
  (email) => processEmail(email, userId),
  { concurrency: 10, stopOnError: false },
);
const inserts = results.filter((r): r is BillingEventInsert => r !== null);
```

`stopOnError: false` 配合「skip + log」策略：單一 email LLM 失敗不會炸整批。

---

## 3. Schema、Prompt、Failure 處理

### Schema 微調（`ExtractionSchema`）

兩個約束加上去，避免下游收到髒值：

```typescript
amount: z.number().positive().optional(),
nextBillingDate: z.iso.date().optional(),  // Zod v4 ISO date
trialEndsAt: z.iso.date().optional(),
```

其他欄位維持現狀。Schema validation fail → skip + log（同一般 LLM 失敗）。

### `PROMPT_VERSION`

從 `"v0-dummy"` 改為 `"v1-gemini-flash-zero-shot"`。每次 prompt 改動 bump（Week 5 會出現 `v2-...`）。

### System prompt（v1 起步版）

```
你是訂閱信件分析師。從 email 中抽取訂閱資訊，依下方 JSON schema 回應。

判斷 isSubscriptionRelated 的規則：
- 是訂閱：定期扣款、月/年費、會員續訂、試用期提醒、訂閱取消通知
- 不是訂閱（false）：
  - 單次購買（Uber Eats 訂單、電商發票、餐廳消費）→ one_time_purchase
  - 行銷信、優惠券、推播 → promotional
  - 電子發票開立通知、密碼重設、登入提醒 → service_unrelated
  - 模糊無法判斷 → unclear

抽欄位規則：
- amount: 純數字，不含貨幣符號。多個金額時取「實際扣款總額」
- rawServiceName: 服務的「品牌名」，不是公司全名
    （例如 "Netflix" 而非 "Netflix International B.V."）
- emailSignalType:
  - billing: 已扣款通知 / 收據
  - renewal_notice: 即將續訂提醒（還沒扣）
  - trial_reminder: 試用期將結束
  - price_change: 漲價/降價公告
  - cancellation: 取消確認
  - we_miss_you: 回流促銷信（已停訂閱）
- nextBillingDate: ISO format (YYYY-MM-DD)

isSubscriptionRelated=false 時，只填 notSubscriptionReason，其他欄位省略。
```

### User prompt 模板

```
From: {email.from}
Subject: {email.subject}
Body:
{email.body}
```

`email.body` 已在 [src/lib/gmail.ts](../../../src/lib/gmail.ts) 截到 8000 字元。

### `llmExtract()` 函式形狀

```typescript
export async function llmExtract(
  email: SubscriptionEmail,
): Promise<Extraction | null> {
  try {
    const { object } = await generateObject({
      model: getModel(),
      schema: ExtractionSchema,
      system: SYSTEM_PROMPT,
      prompt: formatUserPrompt(email),
    });
    return object;
  } catch (err) {
    logExtractionFailure(email.id, err);
    return null;
  }
}
```

`processEmail()` 收到 `null` 就 skip（跟現在收到 blacklisted 一樣的處理路徑）。

### Failure log 格式

| 情境 | Log level | Log 內容 |
|---|---|---|
| Gemini API error（網路 / 5xx / rate limit） | `warn` | `gmailMessageId`, error code, message |
| Schema validation fail | `warn` | `gmailMessageId`, zod issues array, raw LLM output（truncate 500 字） |
| `isSubscriptionRelated=false` | `info` | `gmailMessageId`, `notSubscriptionReason`, subject |
| Missing required fields after parse | `warn` | `gmailMessageId`, 哪些欄位 missing |

用 `console.warn` / `console.info` 即可。CLI script 收集這些 log 統計到報告。

---

## 4. CLI Script: `scripts/analyze-raw-service-names.ts`

### 介面

```bash
npm run analyze:names                          # 用最新 fixture
npm run analyze:names -- --file=path.json     # 指定 fixture
npm run analyze:names -- --limit=20           # 只跑前 20 封（smoke test）
```

### 行為

1. 讀 `sampleEmail/` 目錄找最新 `subscribr-emails-*.json`（或 `--file` 指定）
2. 對所有 email 跑 `llmExtract`（p-map concurrency=10，跟 ingestion 一致）
3. 在記憶體聚合：總數、isSubscriptionRelated 分布、notSubscriptionReason 分布、rawServiceName 頻率、各種失敗
4. 寫 `docs/extractions/{YYYY-MM-DD}-{PROMPT_VERSION}.md`
5. 不碰 DB

### 輸出報告模板

```markdown
# Extraction Report

- Fixture: subscribr-emails-20260503-1557.json
- Prompt version: v1-gemini-flash-zero-shot
- Model: gemini-2.5-flash
- Date: 2026-05-27
- Total emails: 225
- Elapsed: 43.2s (concurrency=10)

## Summary

| Bucket | Count | % |
|---|---|---|
| isSubscriptionRelated=true | 47 | 20.9% |
| isSubscriptionRelated=false | 168 | 74.7% |
| Schema validation fail | 6 | 2.7% |
| API error | 4 | 1.8% |

## isSubscriptionRelated=false breakdown

| notSubscriptionReason | Count |
|---|---|
| one_time_purchase | 89 |
| service_unrelated | 52 |
| promotional | 21 |
| unclear | 6 |

## rawServiceName distribution (subscription emails only)

| rawServiceName | Count | emailSignalType (mode) |
|---|---|---|
| ... | ... | ... |

## Schema validation failures

（每筆列 gmailMessageId、missing/invalid 欄位、raw LLM output truncated 500 字）

## API errors

（每筆列 gmailMessageId、error code）
```

報告 commit 進 repo。Week 5 反推 aliases 的 input 就是這份檔案。

---

## 5. 測試策略

### Unit tests（vitest，全 mock，CI 不打外網）

| 檔案 | 覆蓋 case |
|---|---|
| `extraction.test.ts` | `llmExtract()` 用 `MockLanguageModelV2`：(1) happy path → return Extraction、(2) isSubscriptionRelated=false → return Extraction、(3) schema validation fail → return null + log warn、(4) API error → return null + log warn |
| `extraction.test.ts` | Schema 本身驗證：`amount=0` fail、`amount=-1` fail、`nextBillingDate="2026/06/15"` fail、`"2026-06-15"` pass |
| `ingestion.test.ts` | `processEmail()` async：mock `llmExtract` return null → return null；return valid extraction → return BillingEventInsert with 正確 canonicalId |

Mock 工具：Vercel AI SDK 的 `MockLanguageModelV2`（官方 `ai/test`）。

### 不寫的測試

- 真實 Gemini API call（CI 不打外網、不花錢）
- ingestion → DB 整合測試（用手動跑 Dashboard verification 覆蓋）

---

## 6. Verification Gate

Week 3 不算完成，除非以下全部通過：

1. ✅ `npm test` 全綠
2. ✅ `npm run analyze:names` 跑完 225 封不 crash，產出 markdown
3. ✅ 報告裡 `isSubscriptionRelated=true` 至少 30 封（自己 Gmail 90 天合理範圍）
4. ✅ 隨機抽 5 封被分類成 `isSubscriptionRelated=true` 的 email，人工驗證 `rawServiceName` / `amount` / `emailSignalType` 合理
5. ✅ 隨機抽 5 封 `isSubscriptionRelated=false`，確認不是錯殺
6. ✅ 點 Dashboard [Ingest] 端到端跑通，DB 有 BillingEvent row、Subscription 列表能顯示
7. ✅ Schema fail rate < 5%

第 4-7 步是品質 gate，前 3 步是技術 gate。Week 4 eval 把 4-7 變成量化數字。

---

## 7. Out of Scope

明確不做：

- Few-shot examples（Week 5 才加）
- Eval harness / golden set（Week 4）
- Retry / exponential backoff（v7 設計就是 skip + log）
- Structured logger（用 `console.warn/info`）
- Streaming（Week 10）
- Tool use（Week 6-7）
- 自動排程 ingestion（永久不做）
- Token cost 追蹤 / `AgentTrace` 寫入（Week 8）
- Day 5 報告 dashboard 化（Week 9 順便，或永遠不做）
- Re-extract 既有 BillingEvent 的機制（Week 5 backfill 一起做）

---

## 8. Day-by-day 預估

| Day | 任務 | 預期時數 |
|---|---|---|
| 1 | 學 Vercel AI SDK + `generateObject` + Gemini provider，跑 toy example | 4-6h |
| 2 | 學 `MockLanguageModelV2`、寫 `extraction.test.ts`（mock 為主） | 4-6h |
| 3 | 寫 v1 system prompt + `llmExtract()`，schema 微調 | 3-4h |
| 4 | ingestion 改 async + p-map、`ingestion.test.ts` | 3-4h |
| 5 | 寫 CLI script、跑 fixture、產第一份報告、跑 Dashboard verification | 4-6h |

Day 1-2 學習落後 → 啟動 v7 Plan B：延一週、Week 12 縮短。

---

## 9. 風險

| 風險 | 觸發 | 緩解 |
|---|---|---|
| Gemini Flash 中文 structured output 表現不如預期 | Day 3 試跑 schema fail rate > 20% | 切 `gemini-2.5-pro` 跑 baseline；不要切換 SDK path |
| `MockLanguageModelV2` API 不熟 | Day 2 寫測卡住 | 先用 `vi.spyOn` 直接 mock `llmExtract` 的內部 `generateObject` import |
| 200 封跑完 free tier 額度爆掉 | Day 5 跑報告時 rate limit | 把 `--limit` 加上、分批跑；或臨時切付費 tier（一次跑 < $0.10） |
| Body 截斷在 8000 字導致關鍵資訊遺失 | 報告抽樣時發現 missing field 集中在長 email | Week 5 prompt iteration 時調整 body 摘要策略，Week 3 不動 |

---

## 10. 後續銜接

- **Week 4**：拿這份 spec 產出的 CLI script + fixture 當基礎，加 80 筆 golden set 標註 + per-field metric。`PROMPT_VERSION` 機制直接沿用。
- **Week 5**：拿 `docs/extractions/{date}-{version}.md` 當反推 aliases 的 input，填 `SERVICE_REGISTRY[*].aliases`，跑 backfill script re-normalize 歷史 BillingEvent，再 trigger `upsertSubscriptionsForServices` re-derive Subscription。
- **Week 7**：Tool use 共用 `src/lib/llm.ts` 的 `getModel()`，可以切到不同 model 跑 agent。
