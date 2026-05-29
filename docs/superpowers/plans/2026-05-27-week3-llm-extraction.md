# Week 3 — LLM Extraction Pipeline 實作計畫

> **給 agentic worker：** 必用 SUB-SKILL：用 superpowers:subagent-driven-development（建議）或 superpowers:executing-plans 一個 task 一個 task 執行。每個步驟用 checkbox（`- [ ]`）追蹤。

**目標：** 把 ingestion pipeline 裡的 dummy extractor 換成真正的 Gemini 2.5 Flash extraction（透過 Vercel AI SDK），改成並行處理，並建立一個 fixture-based 的 CLI loop，產出 `rawServiceName` 分布報告供 Week 5 反推 aliases 使用。

**架構：** 用單一檔案 `getModel()` 包住 LLM 選擇（provider-agnostic）。`llmExtract(email, model)` 用既有的 Zod `ExtractionSchema` 呼叫 `generateObject`，回傳 parse 過的物件，任何失敗回傳 `null`（skip + log，不 retry）。`processEmail` 改成 async 並把 model 往下傳；ingestion 用 `p-map`（concurrency 10）跑。一支獨立的 `tsx` script 讀 `sampleEmail/*.json` fixture、跑同一個 extractor、輸出 markdown 報告 — 不碰 DB，完全可重現。

**技術棧：** Vercel AI SDK（`ai` v5 + `@ai-sdk/google` v2）、Gemini 2.5 Flash、`p-map`、`tsx`、`dotenv`、Zod v4、Vitest。

**Spec：** [docs/superpowers/specs/2026-05-27-week3-llm-extraction-design.md](../specs/2026-05-27-week3-llm-extraction-design.md)

---

## 檔案結構

| 檔案 | 職責 |
|---|---|
| `src/lib/llm.ts`（新增） | model 選擇的唯一來源：`getModel()`。要換 provider 只動這裡。 |
| `src/lib/extraction.ts`（修改） | `ExtractionSchema`（強化）、`SYSTEM_PROMPT`、`formatUserPrompt`、`llmExtract`、`logExtractionFailure`。移除 `extractDummy`。 |
| `src/lib/extraction.test.ts`（新增） | schema 驗證測試 + `llmExtract` 行為測試（mock model）。 |
| `src/lib/ingestion.ts`（修改） | `processEmail` 改 async + 加 model 參數；ingestion loop 改 `p-map`。 |
| `src/lib/ingestion.test.ts`（新增） | `processEmail` async 路徑測試（mock model）。 |
| `scripts/analyze-raw-service-names.ts`（新增） | fixture → extraction → markdown 分布報告。不碰 DB。 |
| `docs/extractions/.gitkeep`（新增） | 報告輸出目錄。 |
| `package.json`（修改） | 加 deps + `analyze:names` script。 |
| `.env.example`（新增） | 記錄 `GOOGLE_GENERATIVE_AI_API_KEY`。 |

**既有限制，這週刻意不動：** [src/lib/subscription-derive.ts](../../../src/lib/subscription-derive.ts) 裡的 `deriveSubscriptionState` 沒有把 event 的 `category` / `nextBillingDate` / `trialEndsAt` 映射到 Subscription（它永遠留 `category: "other"`）。那是 derive 的問題，不在 Week 3（extraction）範圍。先放著。

---

## Day 1 — 學 AI SDK + 專案設定

### Task 1：加 dependencies、npm script、env 範例

**檔案：**
- 修改：`package.json`
- 新增：`.env.example`
- 新增：`docs/extractions/.gitkeep`

- [ ] **Step 1：安裝 runtime + dev dependencies**

執行：
```bash
npm install ai@^5 @ai-sdk/google@^2 p-map@^7
npm install -D tsx@^4
```
預期：安裝成功；`ai`、`@ai-sdk/google`、`p-map` 進 `dependencies`，`tsx` 進 `devDependencies`。（`dotenv` 已經是 devDependency。）

- [ ] **Step 2：在 `package.json` 加 `analyze:names` script**

在 `"scripts"` 區塊，`"test": "vitest run",` 後面加一行：
```json
    "analyze:names": "tsx scripts/analyze-raw-service-names.ts",
```

- [ ] **Step 3：建立 `.env.example`**

```bash
# Database (Postgres) — DATABASE_URL is pooled, DIRECT_URL is for migrations
DATABASE_URL=
DIRECT_URL=

# NextAuth + Google OAuth
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Google Generative AI (Gemini) — get a key at https://aistudio.google.com/apikey
GOOGLE_GENERATIVE_AI_API_KEY=
```

- [ ] **Step 4：把真的 Gemini key 放進 `.env.local`**

在 `.env.local`（不是 `.env.example`）加這行，貼上你從 Google AI Studio 拿到的真 key：
```
GOOGLE_GENERATIVE_AI_API_KEY=AIza...your-real-key...
```
確認它存在：
```bash
grep -c GOOGLE_GENERATIVE_AI_API_KEY .env.local
```
預期：`1`

- [ ] **Step 5：建立報告輸出目錄**

執行：
```bash
mkdir -p docs/extractions && touch docs/extractions/.gitkeep
```

- [ ] **Step 6：確認專案還能 build、測試還會過**

執行：
```bash
npm test
```
預期：既有測試（service-normalization、subscription-derive）仍 PASS。

- [ ] **Step 7：Commit**

```bash
git add package.json package-lock.json .env.example docs/extractions/.gitkeep
git commit -m "chore: add AI SDK, p-map, tsx deps and analyze:names script"
```

---

### Task 2（學習）：確認 `generateObject` 對 Gemini 跑得通

> **為什麼有這個 task：** AGENTS.md 規定寫 code 前要先讀安裝好的 docs，而這是你第一次接 Vercel AI SDK。這個 task 產出一支用完即丟的 scratch script，在你蓋任何正式 code 之前，先證明 API key、provider、`generateObject` 三件事端到端都通。最後刪掉。

**檔案：**
- 新增（暫時）：`scripts/_scratch-toy.ts`

- [ ] **Step 1：讀安裝好的 AI SDK `generateObject` docs**

執行：
```bash
ls node_modules/ai/dist 2>/dev/null | head
find node_modules/@ai-sdk/google -name "*.md" 2>/dev/null | head
```
打開 AI SDK core docs（`ai` 套件的 README，以及 `node_modules/ai/dist/docs/` 底下若有 `generate-object` 相關文件），讀 `generateObject({ model, schema, prompt })` 怎麼回傳 `{ object }`。確認 import 路徑：`import { generateObject } from "ai"` 和 `import { google } from "@ai-sdk/google"`。

- [ ] **Step 2：寫一支 toy script**

`scripts/_scratch-toy.ts`：
```typescript
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

async function main() {
  const { object } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: z.object({
      sentiment: z.enum(["positive", "negative", "neutral"]),
      reason: z.string(),
    }),
    prompt: "分析這句話的情緒：這個產品改變了我的生活，太棒了！",
  });
  console.log(object);
}

main().catch((e) => {
  console.error("TOY FAILED:", e);
  process.exit(1);
});
```

- [ ] **Step 3：跑這支 toy script**

執行：
```bash
npx tsx scripts/_scratch-toy.ts
```
預期：印出類似 `{ sentiment: 'positive', reason: '...' }`。若拿到 auth error，代表 `.env.local` 的 key 錯了。若拿到 model-not-found error，回 Step 1 對照 provider docs 重新確認 model id `gemini-2.5-flash`。

- [ ] **Step 4：刪掉 scratch script（不要 commit）**

執行：
```bash
rm scripts/_scratch-toy.ts
```

這個 task 不 commit — 純學習。

---

## Day 2 — 學 AI SDK 測試 + 強化 schema

### Task 3（學習）：搞懂 `MockLanguageModelV2`

> **為什麼有這個 task：** 本計畫所有 unit test 都 mock model，讓 CI 永遠不打網路。mock API（`ai/test` 的 `MockLanguageModelV2`）在 AI SDK 不同大版本間改過 — 你必須先確認你安裝的版本要的確切形狀，再去寫正式測試，否則會跟幻影錯誤纏鬥。

**檔案：**
- 新增（暫時）：`src/lib/_scratch.test.ts`

- [ ] **Step 1：讀測試 docs**

執行：
```bash
find node_modules/ai -name "*.md" | xargs grep -l -i "MockLanguageModelV2\|test" 2>/dev/null | head
ls node_modules/ai/test* 2>/dev/null
```
讀 `MockLanguageModelV2` 怎麼接一個 `doGenerate` 函式，以及 `generateObject` 要從中 parse 出物件時，那個函式必須回傳什麼。

- [ ] **Step 2：寫一個 scratch test，鏡射本計畫用的形狀**

`src/lib/_scratch.test.ts`：
```typescript
import { describe, it, expect } from "vitest";
import { generateObject } from "ai";
import { MockLanguageModelV2 } from "ai/test";
import { z } from "zod";

describe("mock sanity", () => {
  it("generateObject parses the mock's text content", async () => {
    const model = new MockLanguageModelV2({
      doGenerate: async () => ({
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
        warnings: [],
      }),
    });
    const { object } = await generateObject({
      model,
      schema: z.object({ ok: z.boolean() }),
      prompt: "ignored",
    });
    expect(object).toEqual({ ok: true });
  });
});
```

- [ ] **Step 3：跑它**

執行：
```bash
npx vitest run src/lib/_scratch.test.ts
```
預期：PASS。**若失敗**，依 Step 1 的 docs 調整 `doGenerate` 回傳形狀（例如某些版本用 `text` 而非 `content` 陣列）。讓這個測試會過的形狀，就是你在 Task 6、Task 8 要用的形狀 — 記下來。

- [ ] **Step 4：刪掉 scratch test**

執行：
```bash
rm src/lib/_scratch.test.ts
```

不 commit — 純學習。

---

### Task 4：強化 `ExtractionSchema`

**檔案：**
- 修改：`src/lib/extraction.ts:9-13`（`amount`、`nextBillingDate`、`trialEndsAt` 三個欄位）
- 測試：`src/lib/extraction.test.ts`

> 擋掉會弄髒下游 DB 的值：非正數金額、非 ISO 日期。spec 接受「日期格式錯就整筆 extraction 被 skip + log」（Week 4 量化），而不是默默存進去。

- [ ] **Step 1：寫會失敗的 schema 測試**

建立 `src/lib/extraction.test.ts`：
```typescript
import { describe, it, expect } from "vitest";
import { ExtractionSchema } from "./extraction";

describe("ExtractionSchema", () => {
  const base = {
    isSubscriptionRelated: true,
    rawServiceName: "Cursor",
    currency: "USD" as const,
    cycle: "monthly" as const,
    category: "ai" as const,
    emailSignalType: "billing" as const,
    isTrial: false,
  };

  it("rejects amount of zero", () => {
    const r = ExtractionSchema.safeParse({ ...base, amount: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const r = ExtractionSchema.safeParse({ ...base, amount: -5 });
    expect(r.success).toBe(false);
  });

  it("accepts a positive amount", () => {
    const r = ExtractionSchema.safeParse({ ...base, amount: 20 });
    expect(r.success).toBe(true);
  });

  it("rejects a non-ISO nextBillingDate", () => {
    const r = ExtractionSchema.safeParse({
      ...base,
      amount: 20,
      nextBillingDate: "2026/06/15",
    });
    expect(r.success).toBe(false);
  });

  it("accepts an ISO nextBillingDate", () => {
    const r = ExtractionSchema.safeParse({
      ...base,
      amount: 20,
      nextBillingDate: "2026-06-15",
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

執行：
```bash
npx vitest run src/lib/extraction.test.ts
```
預期：FAIL — `amount: 0` 跟 `amount: -5` 目前會過（schema 沒有 `.positive()`），`"2026/06/15"` 也會過（schema 是普通 `z.string()`）。

- [ ] **Step 3：強化 schema 欄位**

在 `src/lib/extraction.ts`，改這三個欄位：
```typescript
  amount: z.number().positive().optional(),
```
```typescript
  nextBillingDate: z.iso.date().optional(),
```
```typescript
  trialEndsAt: z.iso.date().optional(),
```
（其他欄位都不動。）

- [ ] **Step 4：跑測試確認通過**

執行：
```bash
npx vitest run src/lib/extraction.test.ts
```
預期：PASS（全部 5 個）。

- [ ] **Step 5：Commit**

```bash
git add src/lib/extraction.ts src/lib/extraction.test.ts
git commit -m "feat: harden ExtractionSchema (positive amount, ISO dates)"
```

---

## Day 3 — `getModel()`、prompt、`llmExtract`

### Task 5：在 `src/lib/llm.ts` 建立 `getModel()`

**檔案：**
- 新增：`src/lib/llm.ts`

> 一個檔案擁有 model 選擇。之後要換 OpenAI / 本地 model 只改這個檔案。

- [ ] **Step 1：寫 `src/lib/llm.ts`**

```typescript
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

// Single source of truth for the LLM. To switch provider (OpenAI, Gemini Pro,
// local Ollama via @ai-sdk/openai-compatible), change only this function.
export function getModel(): LanguageModel {
  return google("gemini-2.5-flash");
}
```

- [ ] **Step 2：確認型別檢查通過**

執行：
```bash
npx tsc --noEmit
```
預期：`src/lib/llm.ts` 沒有錯誤。

- [ ] **Step 3：Commit**

```bash
git add src/lib/llm.ts
git commit -m "feat: add getModel() provider wrapper (Gemini 2.5 Flash)"
```

---

### Task 6：實作 `llmExtract` + prompt（取代 dummy）

**檔案：**
- 修改：`src/lib/extraction.ts`（移除 `extractDummy`，加 prompt + `llmExtract` + `logExtractionFailure`，bump `PROMPT_VERSION`）
- 測試：`src/lib/extraction.test.ts`

- [ ] **Step 1：寫會失敗的 `llmExtract` 測試**

在 `src/lib/extraction.test.ts` 後面追加：
```typescript
import { MockLanguageModelV2 } from "ai/test";
import { vi } from "vitest";
import { llmExtract } from "./extraction";
import type { SubscriptionEmail } from "@/lib/gmail";

const email: SubscriptionEmail = {
  id: "msg-1",
  from: "noreply@cursor.com",
  subject: "Receipt from Cursor",
  date: "Mon, 12 May 2026 09:00:00 +0000",
  snippet: "Thank you for your payment",
  body: "Thank you for your payment of $20.00 USD for Cursor Pro.",
};

function modelReturning(obj: unknown) {
  return new MockLanguageModelV2({
    doGenerate: async () => ({
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      content: [{ type: "text", text: JSON.stringify(obj) }],
      warnings: [],
    }),
  });
}

function modelThrowing() {
  return new MockLanguageModelV2({
    doGenerate: async () => {
      throw new Error("network down");
    },
  });
}

describe("llmExtract", () => {
  it("returns the parsed object on a valid subscription extraction", async () => {
    const model = modelReturning({
      isSubscriptionRelated: true,
      rawServiceName: "Cursor Pro",
      amount: 20,
      currency: "USD",
      cycle: "monthly",
      category: "ai",
      emailSignalType: "billing",
      isTrial: false,
    });
    const result = await llmExtract(email, model);
    expect(result).not.toBeNull();
    expect(result!.rawServiceName).toBe("Cursor Pro");
    expect(result!.amount).toBe(20);
  });

  it("returns null and logs when the model output fails schema validation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // amount as a string violates z.number()
    const model = modelReturning({
      isSubscriptionRelated: true,
      rawServiceName: "Cursor",
      amount: "twenty",
      currency: "USD",
      cycle: "monthly",
      category: "ai",
      emailSignalType: "billing",
    });
    const result = await llmExtract(email, model);
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns null and logs when the model call throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await llmExtract(email, modelThrowing());
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

執行：
```bash
npx vitest run src/lib/extraction.test.ts
```
預期：FAIL — `llmExtract` 還沒 export。

- [ ] **Step 3：實作 prompt + `llmExtract`，並移除 `extractDummy`**

在 `src/lib/extraction.ts`：

(a) 更新最上面的 imports：
```typescript
import { z } from "zod";
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import type { SubscriptionEmail } from "@/lib/gmail";
import { getModel } from "@/lib/llm";
```

(b) 改 `PROMPT_VERSION`：
```typescript
export const PROMPT_VERSION = "v1-gemini-flash-zero-shot";
```

(c) **刪掉**整個 `extractDummy` 函式（原檔第 35-48 行）。

(d) 在 `Extraction` type / `PROMPT_VERSION` 下方加：
```typescript
export const SYSTEM_PROMPT = `你是訂閱信件分析師。從 email 中抽取訂閱資訊，依下方 JSON schema 回應。

判斷 isSubscriptionRelated 的規則：
- 是訂閱：定期扣款、月/年費、會員續訂、試用期提醒、訂閱取消通知
- 不是訂閱（false）：
  - 單次購買（Uber Eats 訂單、電商發票、餐廳消費）→ one_time_purchase
  - 行銷信、優惠券、推播 → promotional
  - 電子發票開立通知、密碼重設、登入提醒 → service_unrelated
  - 模糊無法判斷 → unclear

抽欄位規則：
- amount: 純數字，不含貨幣符號。多個金額時取「實際扣款總額」
- rawServiceName: 服務的「品牌名」，不是公司全名（例如 "Netflix" 而非 "Netflix International B.V."）
- emailSignalType:
  - billing: 已扣款通知 / 收據
  - renewal_notice: 即將續訂提醒（還沒扣）
  - trial_reminder: 試用期將結束
  - price_change: 漲價/降價公告
  - cancellation: 取消確認
  - we_miss_you: 回流促銷信（已停訂閱）
- nextBillingDate: ISO 格式 (YYYY-MM-DD)

isSubscriptionRelated=false 時，只填 notSubscriptionReason，其他欄位省略。`;

export function formatUserPrompt(email: SubscriptionEmail): string {
  return `From: ${email.from}
Subject: ${email.subject}
Body:
${email.body}`;
}

function logExtractionFailure(gmailMessageId: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "Unknown";
  const message = err instanceof Error ? err.message : String(err);
  const kind =
    name.includes("Validation") || name.includes("NoObject")
      ? "schema_fail"
      : "api_error";
  console.warn(
    `[extraction:${kind}] gmailMessageId=${gmailMessageId} ${message}`,
  );
}

// Returns the parsed extraction, or null on any failure (skip + log, no retry).
// The caller decides what to do with isSubscriptionRelated=false.
export async function llmExtract(
  email: SubscriptionEmail,
  model: LanguageModel = getModel(),
): Promise<Extraction | null> {
  try {
    const { object } = await generateObject({
      model,
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

- [ ] **Step 4：跑測試確認通過**

執行：
```bash
npx vitest run src/lib/extraction.test.ts
```
預期：PASS（全部 8 個）。若 schema-fail 測試沒 log，確認 mock 形狀符合你在 Task 3 學到的。

- [ ] **Step 5：確認 dummy 已移除、沒有別處再 import 它**

執行：
```bash
grep -rn "extractDummy" src/
```
預期：沒有任何 match。（Task 7 會修 `ingestion.ts` 因此壞掉的 import。）

- [ ] **Step 6：Commit**

```bash
git add src/lib/extraction.ts src/lib/extraction.test.ts
git commit -m "feat: real Gemini extraction via llmExtract, drop dummy"
```

---

## Day 4 — async `processEmail` + 並行 ingestion

### Task 7：把 `processEmail` 改 async

**檔案：**
- 修改：`src/lib/ingestion.ts:41-77`（`processEmail`）及其 imports
- 測試：`src/lib/ingestion.test.ts`

- [ ] **Step 1：寫會失敗的 `processEmail` 測試**

建立 `src/lib/ingestion.test.ts`：
```typescript
import { describe, it, expect } from "vitest";
import { MockLanguageModelV2 } from "ai/test";
import { processEmail } from "./ingestion";
import type { SubscriptionEmail } from "@/lib/gmail";

const email: SubscriptionEmail = {
  id: "msg-1",
  from: "noreply@cursor.com",
  subject: "Receipt from Cursor",
  date: "Mon, 12 May 2026 09:00:00 +0000",
  snippet: "payment",
  body: "Thank you for your payment of $20.00 USD for Cursor.",
};

function modelReturning(obj: unknown) {
  return new MockLanguageModelV2({
    doGenerate: async () => ({
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      content: [{ type: "text", text: JSON.stringify(obj) }],
      warnings: [],
    }),
  });
}

describe("processEmail", () => {
  it("builds a BillingEventInsert with a normalized canonical id", async () => {
    const model = modelReturning({
      isSubscriptionRelated: true,
      rawServiceName: "Cursor",
      amount: 20,
      currency: "USD",
      cycle: "monthly",
      category: "ai",
      emailSignalType: "billing",
      isTrial: false,
    });
    const row = await processEmail(email, "user-1", model);
    expect(row).not.toBeNull();
    expect(row!.serviceName).toBe("cursor"); // slugify fallback, aliases empty
    expect(row!.rawServiceName).toBe("Cursor");
    expect(row!.amountInTwd).toBeCloseTo(20 * 31.5, 2);
    expect(row!.gmailMessageId).toBe("msg-1");
  });

  it("returns null when isSubscriptionRelated is false", async () => {
    const model = modelReturning({
      isSubscriptionRelated: false,
      notSubscriptionReason: "one_time_purchase",
    });
    const row = await processEmail(email, "user-1", model);
    expect(row).toBeNull();
  });

  it("returns null for a blacklisted email without calling the model", async () => {
    const blacklisted: SubscriptionEmail = {
      ...email,
      subject: "Please verify your email",
    };
    const throwing = new MockLanguageModelV2({
      doGenerate: async () => {
        throw new Error("model should not be called");
      },
    });
    const row = await processEmail(blacklisted, "user-1", throwing);
    expect(row).toBeNull();
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

執行：
```bash
npx vitest run src/lib/ingestion.test.ts
```
預期：FAIL — `processEmail` 還是同步、還在用 `extractDummy`（Task 6 之後那個 import 已壞），整個檔案連 compile 都過不了。

- [ ] **Step 3：把 `processEmail` 改寫成 async**

在 `src/lib/ingestion.ts`：

(a) 替換 extraction 的 import 區塊：
```typescript
import { PROMPT_VERSION, llmExtract } from "@/lib/extraction";
import { getModel } from "@/lib/llm";
import type { LanguageModel } from "ai";
```
（移除 `ExtractionSchema`、`extractDummy`、以及 `type Extraction` import — 這裡不再用到。）

(b) 把整個 `processEmail` 函式換成：
```typescript
export async function processEmail(
  email: SubscriptionEmail,
  userId: string,
  model: LanguageModel = getModel(),
): Promise<BillingEventInsert | null> {
  if (isBlacklisted(email)) return null;

  const extraction = await llmExtract(email, model);
  if (extraction === null) return null;

  if (!extraction.isSubscriptionRelated) {
    console.info(
      `[extraction:not_subscription] gmailMessageId=${email.id} reason=${extraction.notSubscriptionReason ?? "unspecified"} subject=${email.subject}`,
    );
    return null;
  }

  const { rawServiceName, amount, currency, cycle, emailSignalType } =
    extraction;
  if (
    rawServiceName === undefined ||
    amount === undefined ||
    currency === undefined ||
    cycle === undefined ||
    emailSignalType === undefined
  ) {
    console.warn(`[extraction:missing_fields] gmailMessageId=${email.id}`);
    return null;
  }

  const { canonicalId } = normalizeServiceName(rawServiceName);

  return {
    userId,
    gmailMessageId: email.id,
    emailReceivedAt: parseEmailDate(email.date),
    rawServiceName,
    serviceName: canonicalId,
    amount,
    currency,
    amountInTwd: convertToTwd(amount, currency),
    cycle,
    emailSignalType,
    promptVersion: PROMPT_VERSION,
  };
}
```

- [ ] **Step 4：跑測試確認通過**

執行：
```bash
npx vitest run src/lib/ingestion.test.ts
```
預期：PASS（全部 3 個）。

- [ ] **Step 5：Commit**

```bash
git add src/lib/ingestion.ts src/lib/ingestion.test.ts
git commit -m "feat: make processEmail async with real extraction"
```

---

### Task 8：用 `p-map` 並行跑 ingestion

**檔案：**
- 修改：`src/lib/ingestion.ts:97-122`（`ingestEmails` 裡的 ingestion loop）

> `processEmail` 現在是 async。原本的序列 `for` loop 會一筆一筆 await LLM call。改成 `p-map` concurrency 10 + `stopOnError: false`，讓單封失敗不會中斷整批。

- [ ] **Step 1：加 `p-map` import**

在 `src/lib/ingestion.ts` 最上面：
```typescript
import pMap from "p-map";
```

- [ ] **Step 2：替換序列 loop**

把這段：
```typescript
  const inserts: BillingEventInsert[] = [];
  let blacklistedCount = 0;
  for (const email of emails) {
    const row = processEmail(email, userId);
    if (row === null) {
      blacklistedCount += 1;
      continue;
    }
    inserts.push(row);
  }
```
換成：
```typescript
  const results = await pMap(
    emails,
    (email) => processEmail(email, userId),
    { concurrency: 10, stopOnError: false },
  );
  const inserts = results.filter(
    (r): r is BillingEventInsert => r !== null,
  );
  // Everything fetched but not turned into an insert: blacklisted, not a
  // subscription, missing fields, or an extraction failure.
  const blacklistedCount = emails.length - inserts.length;
```

- [ ] **Step 3：確認整個測試 suite 還會過**

執行：
```bash
npm test
```
預期：全部 PASS（service-normalization、subscription-derive、extraction、ingestion）。

- [ ] **Step 4：整個專案型別檢查**

執行：
```bash
npx tsc --noEmit
```
預期：無錯誤。

- [ ] **Step 5：Commit**

```bash
git add src/lib/ingestion.ts
git commit -m "perf: run email extraction in parallel via p-map (concurrency 10)"
```

---

## Day 5 — fixture 報告 script + 端到端驗證

### Task 9：建立 `analyze-raw-service-names` CLI script

**檔案：**
- 新增：`scripts/analyze-raw-service-names.ts`

> 讀最新的 `sampleEmail/*.json` fixture，對每封 email 跑同一個 `llmExtract`（concurrency 10），在記憶體聚合，把 markdown 報告寫到 `docs/extractions/`。不碰 DB。這是 prompt 迭代的 loop，也是 Week 5 反推 aliases 的 input。

- [ ] **Step 1：寫 script**

`scripts/analyze-raw-service-names.ts`：
```typescript
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pMap from "p-map";
import { llmExtract, PROMPT_VERSION } from "@/lib/extraction";
import type { SubscriptionEmail } from "@/lib/gmail";

const MODEL_ID = "gemini-2.5-flash";
const SAMPLE_DIR = "sampleEmail";
const OUT_DIR = "docs/extractions";

type Fixture = { fetchedAt: string; count: number; emails: SubscriptionEmail[] };

function parseArgs() {
  const args = process.argv.slice(2);
  let file: string | undefined;
  let limit: number | undefined;
  for (const a of args) {
    if (a.startsWith("--file=")) file = a.slice("--file=".length);
    else if (a.startsWith("--limit=")) limit = Number(a.slice("--limit=".length));
  }
  return { file, limit };
}

function newestFixture(): string {
  const files = readdirSync(SAMPLE_DIR)
    .filter((f) => f.startsWith("subscribr-emails-") && f.endsWith(".json"))
    .sort();
  if (files.length === 0) throw new Error(`No fixture in ${SAMPLE_DIR}/`);
  return join(SAMPLE_DIR, files[files.length - 1]);
}

function incr(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function table(rows: [string, number][], headers: [string, string]): string {
  const sorted = [...rows].sort((a, b) => b[1] - a[1]);
  const lines = [`| ${headers[0]} | ${headers[1]} |`, "|---|---|"];
  for (const [k, v] of sorted) lines.push(`| ${k} | ${v} |`);
  return lines.join("\n");
}

async function main() {
  const { file, limit } = parseArgs();
  const path = file ?? newestFixture();
  const fixture = JSON.parse(readFileSync(path, "utf-8")) as Fixture;
  const emails = limit ? fixture.emails.slice(0, limit) : fixture.emails;

  const started = Date.now();
  const extractions = await pMap(emails, (e) => llmExtract(e), {
    concurrency: 10,
    stopOnError: false,
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  let related = 0;
  let notRelated = 0;
  let failed = 0; // null = schema fail or API error (already logged by llmExtract)
  const reasons = new Map<string, number>();
  const rawNames = new Map<string, number>();

  for (const ex of extractions) {
    if (ex === null) {
      failed += 1;
      continue;
    }
    if (!ex.isSubscriptionRelated) {
      notRelated += 1;
      incr(reasons, ex.notSubscriptionReason ?? "unspecified");
      continue;
    }
    related += 1;
    if (ex.rawServiceName) incr(rawNames, ex.rawServiceName);
  }

  const today = new Date().toISOString().slice(0, 10);
  const summary = [
    "| Bucket | Count |",
    "|---|---|",
    `| isSubscriptionRelated=true | ${related} |`,
    `| isSubscriptionRelated=false | ${notRelated} |`,
    `| failed (schema/API, see logs) | ${failed} |`,
  ].join("\n");

  const report = `# Extraction Report

- Fixture: ${path}
- Prompt version: ${PROMPT_VERSION}
- Model: ${MODEL_ID}
- Date: ${today}
- Total emails: ${emails.length}
- Elapsed: ${elapsed}s (concurrency=10)

## Summary

${summary}

## isSubscriptionRelated=false breakdown

${table([...reasons.entries()], ["notSubscriptionReason", "Count"])}

## rawServiceName distribution (subscription emails only)

${table([...rawNames.entries()], ["rawServiceName", "Count"])}
`;

  const outPath = join(OUT_DIR, `${today}-${PROMPT_VERSION}.md`);
  writeFileSync(outPath, report, "utf-8");
  console.log(`Wrote ${outPath}`);
  console.log(
    `related=${related} notRelated=${notRelated} failed=${failed} elapsed=${elapsed}s`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2：用小片段 smoke test（便宜，驗證接線）**

執行：
```bash
npm run analyze:names -- --limit=5
```
預期：印出 `Wrote docs/extractions/2026-...-v1-gemini-flash-zero-shot.md` 加一行 summary。打開檔案確認有那三個 section。若拿到 auth error，代表 `.env.local` key 缺/錯。

- [ ] **Step 3：跑完整 fixture**

執行：
```bash
npm run analyze:names
```
預期：兩分鐘內跑完；報告顯示 `isSubscriptionRelated=true` ≥ 30、`rawServiceName` 表有資料。（若 free tier 撞 rate limit，用 `--limit=100` 分兩次跑，或等一分鐘。）

- [ ] **Step 4：對照驗證 gate 用肉眼檢查報告**

打開產出的 `docs/extractions/<date>-v1-gemini-flash-zero-shot.md`，檢查：
- `isSubscriptionRelated=true` ≥ 30
- `failed` 數量 < 總數的 5%（若更高代表 prompt/schema 不穩 — 記下來給 Week 4，但不擋這次 commit）
- 從 `rawServiceName` 表挑 5 個名字，確認是真的服務，不是 Uber Eats 訂單 / 電子發票通知

- [ ] **Step 5：Commit script 跟第一份報告**

```bash
git add scripts/analyze-raw-service-names.ts docs/extractions/
git commit -m "feat: fixture-based rawServiceName distribution report script"
```

---

### Task 10：透過 dashboard 端到端驗證

**檔案：** 無（spec §6 的手動驗證 gate）

> Task 1-9 已被 unit test + fixture script 覆蓋。這個 task 證明真實 pipeline 會寫進 DB 並 render — 那正是 fixture 路徑刻意跳過的部分。

- [ ] **Step 1：啟動 dev server**

執行：
```bash
npm run dev
```
預期：server 在 http://localhost:3000 起來，terminal 沒有 module/type error。

- [ ] **Step 2：登入並觸發 ingestion**

瀏覽器：用 Google 登入、進 dashboard、點 Ingest 按鈕。看 server terminal — 應該會出現 `[extraction:not_subscription]` info 行，可能也有 `[extraction:schema_fail]` / `[extraction:api_error]` warning，但不該有未捕捉的 exception。

- [ ] **Step 3：確認 DB 有資料**

執行：
```bash
npx prisma studio
```
在 Prisma Studio：確認 `BillingEvent` 有 row、`rawServiceName` / `serviceName` / `amount` 非空，`Subscription` 至少有一筆 derive 出來的 row。確認 `promptVersion` 是 `v1-gemini-flash-zero-shot`。

- [ ] **Step 4：確認 dashboard 有 render 訂閱列表**

回瀏覽器，確認訂閱列表顯示 derive 出來的訂閱（不是空的、不是 error state）。

- [ ] **Step 5：最後再跑一次完整 gate**

執行：
```bash
npm test && npx tsc --noEmit
```
預期：全部測試 PASS、無型別錯誤。

- [ ] **Step 6：最終 commit（若驗證過程有任何改動）**

```bash
git add -A
git commit -m "chore: Week 3 verification pass" || echo "nothing to commit"
```

---

## 驗證 Gate（spec §6）— 結束時必須全部成立

1. `npm test` 全綠
2. `npm run analyze:names` 跑完整 fixture 不 crash 並寫出 markdown
3. 報告顯示 `isSubscriptionRelated=true` ≥ 30
4. 抽 5 封 `true` 的 email，`rawServiceName` / `amount` / `emailSignalType` 合理
5. 抽 5 封 `false` 的 email，沒有被錯殺
6. Dashboard Ingest 會寫 `BillingEvent` + `Subscription` 並 render
7. `failed`（schema/API）比率 < 5%

若 gate 7 失敗（schema-fail 率高），最可能的原因是嚴格的 `z.iso.date()` 擋掉了 LLM 真實的日期格式 — 記下來給 Week 4 eval，在那裡用量化（soft date validation vs. 收緊 prompt）決定怎麼修，而不是現在用猜的。

---

## 不在範圍內（這週不要做）

few-shot examples（Week 5）、eval harness / golden set（Week 4）、retry/backoff、structured logger、streaming（Week 10）、tool use（Week 6-7）、排程 ingestion（永不）、token-cost 追蹤 / AgentTrace（Week 8）、把報告 dashboard 化（Week 9）、重抽既有 BillingEvent（Week 5 backfill）。
