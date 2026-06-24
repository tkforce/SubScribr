# Week 3 Day 5 — 抽取品質檢查與 Prompt 迭代 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 inspect tool + 跨版本 compare，跑一輪「人工標 false positive → 收緊 SYSTEM_PROMPT + few-shot 負面範例 → 重跑驗證」的 prompt 迭代迴圈。

**Architecture:** `scripts/debug-extractions.ts` 演化成 `scripts/inspect-extractions.ts`（JSON 輸出 + `--compare`），直接 import production 的 `SYSTEM_PROMPT` / `ExtractionSchema` / `getModel()` 保持保真度。Production code 只動 `extraction.ts` 的 prompt 字串與 `PROMPT_VERSION`，gate 邏輯不動。版本紀錄寫進 `docs/extractions/PROMPT_LOG.md`（唯一要 commit 的 extraction 產物）。

**Tech Stack:** tsx、p-map、Vercel AI SDK `generateObject`、Gemini 2.5 Flash Lite。

**Spec:** [docs/superpowers/specs/2026-06-11-week3-day5-prompt-iteration-design.md](../specs/2026-06-11-week3-day5-prompt-iteration-design.md)

**⚠️ 人工參與點：** Task 3 Step 4（標 false positive）與 Task 5 Step 3（確認翻轉清單）需要 user 本人判斷，executor 跑到這裡必須停下來等 user 輸入，不可自行代標。

---

### Task 1: 隱私保護（.gitignore）+ package.json scripts 整理

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`（scripts 區塊）

- [ ] **Step 1: .gitignore 加入 extraction 產物保護區塊**

在 `.gitignore` 檔尾追加：

```gitignore
# extraction artifacts contain personal email content — never commit
/sampleEmail/
/docs/extractions/*
!/docs/extractions/PROMPT_LOG.md
```

注意：必須用 `/docs/extractions/*`（不是 `/docs/extractions/`），git 無法 un-ignore 已被整目錄 ignore 的檔案，`*` 形式才能讓 `!PROMPT_LOG.md` 例外生效。

- [ ] **Step 2: 驗證 ignore 規則**

```bash
git check-ignore -v sampleEmail/subscribr-emails-20260503-1557.json
git check-ignore -v docs/extractions/debug-2026-06-04T09-18-45.md
git check-ignore docs/extractions/PROMPT_LOG.md; echo "exit=$?"
```

Expected: 前兩個各印出一行匹配規則；第三個無輸出且 `exit=1`（PROMPT_LOG.md 不被 ignore）。

- [ ] **Step 3: 替換死 script**

`package.json` scripts 區塊，把：

```json
"analyze:names": "tsx scripts/analyze-raw-service-names.ts",
```

換成：

```json
"inspect:extractions": "tsx scripts/inspect-extractions.ts",
```

（`scripts/analyze-raw-service-names.ts` 從未建立，原 plan Task 9 已被 inspect tool 取代。）

- [ ] **Step 4: Commit**

```bash
git add .gitignore package.json
git commit -m "chore: gitignore extraction artifacts (personal email content), replace dead analyze:names script"
```

---

### Task 2: Inspect tool（`scripts/inspect-extractions.ts`）

**Files:**
- Create: `scripts/inspect-extractions.ts`
- Delete: `scripts/debug-extractions.ts`（untracked，從未 commit，被本檔取代）

依 spec 第 5 節，dev script 不寫 unit test，用 `--limit` smoke test 驗證。

- [ ] **Step 1: 寫 `scripts/inspect-extractions.ts`**

```typescript
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import pMap from "p-map";
import { generateObject } from "ai";
import { getModel } from "@/lib/llm";
import { isBlacklisted } from "@/lib/blacklist";
import {
  ExtractionSchema,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  formatUserPrompt,
  type Extraction,
} from "@/lib/extraction";
import type { SubscriptionEmail } from "@/lib/gmail";

const SAMPLE_DIR = "sampleEmail";
const OUT_DIR = "docs/extractions";

type Fixture = {
  fetchedAt: string;
  count: number;
  emails: SubscriptionEmail[];
};

type InspectResult = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  body: string; // 人工判斷 FP 需要全文；輸出檔已 gitignore
  outcome: "extracted" | "extract_failed" | "blacklisted";
  extraction: Extraction | null;
  error: { name: string; message: string } | null;
};

type InspectReport = {
  promptVersion: string;
  model: string;
  fixture: string;
  ranAt: string;
  args: { onlyTrue: boolean; limit: number | null; concurrency: number };
  summary: {
    total: number;
    blacklisted: number;
    true: number;
    false: number;
    extractFailed: number;
  };
  results: InspectResult[];
};

function parseArgs() {
  const args = process.argv.slice(2);
  let file: string | undefined;
  let compare: string | undefined;
  let limit: number | undefined;
  let concurrency = 20; // match ingestion pipeline default
  let onlyTrue = false;
  for (const a of args) {
    if (a.startsWith("--file=")) file = a.slice("--file=".length);
    else if (a.startsWith("--compare=")) compare = a.slice("--compare=".length);
    else if (a.startsWith("--limit=")) limit = Number(a.slice("--limit=".length));
    else if (a.startsWith("--concurrency="))
      concurrency = Number(a.slice("--concurrency=".length));
    else if (a === "--only-true") onlyTrue = true;
  }
  return { file, compare, limit, concurrency, onlyTrue };
}

function newestFixture(): string {
  const files = readdirSync(SAMPLE_DIR)
    .filter((f) => f.startsWith("subscribr-emails-") && f.endsWith(".json"))
    .sort();
  if (files.length === 0) throw new Error(`No fixture in ${SAMPLE_DIR}/`);
  return join(SAMPLE_DIR, files[files.length - 1]);
}

// 與 production processEmail 同一決策樹：blacklist gate → llm extract。
// 直接呼叫 generateObject（而非 llmExtract）以保留 error 細節；
// prompt/schema/model 與 production 完全同源。
async function inspectOne(email: SubscriptionEmail): Promise<InspectResult> {
  const base = {
    id: email.id,
    from: email.from,
    subject: email.subject,
    snippet: email.snippet,
    body: email.body,
  };
  if (isBlacklisted(email)) {
    return { ...base, outcome: "blacklisted", extraction: null, error: null };
  }
  try {
    const { object } = await generateObject({
      model: getModel(),
      schema: ExtractionSchema,
      system: SYSTEM_PROMPT,
      prompt: formatUserPrompt(email),
    });
    return { ...base, outcome: "extracted", extraction: object, error: null };
  } catch (err) {
    return {
      ...base,
      outcome: "extract_failed",
      extraction: null,
      error: {
        name: err instanceof Error ? err.name : "Unknown",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

function trunc(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n) + "…" : oneLine;
}

function flag(r: InspectResult): "true" | "false" | "failed" | "blacklisted" {
  if (r.outcome === "blacklisted") return "blacklisted";
  if (r.outcome === "extract_failed") return "failed";
  return r.extraction?.isSubscriptionRelated ? "true" : "false";
}

function printCompare(oldPath: string, current: InspectResult[]): void {
  const old = JSON.parse(readFileSync(oldPath, "utf-8")) as InspectReport;
  if (old.args.onlyTrue) {
    console.warn(
      `⚠️  ${oldPath} 是 --only-true 輸出，缺 false 側資料，false→true 翻轉偵測不完整。請用全量 JSON 當 compare 基準。`,
    );
  }
  const oldById = new Map(old.results.map((r) => [r.id, r]));

  const trueToFalse: [InspectResult, InspectResult][] = [];
  const falseToTrue: [InspectResult, InspectResult][] = [];
  const failedInvolved: [InspectResult | undefined, InspectResult][] = [];
  let stableTrue = 0;
  let stableFalse = 0;
  let notInOld = 0;

  for (const cur of current) {
    const prev = oldById.get(cur.id);
    if (!prev) {
      notInOld += 1;
      continue;
    }
    const a = flag(prev);
    const b = flag(cur);
    if (a === "failed" || b === "failed") failedInvolved.push([prev, cur]);
    else if (a === "true" && b === "false") trueToFalse.push([prev, cur]);
    else if (a === "false" && b === "true") falseToTrue.push([prev, cur]);
    else if (a === "true" && b === "true") stableTrue += 1;
    else if (a === "false" && b === "false") stableFalse += 1;
  }

  const reason = (r: InspectResult) =>
    r.extraction?.isSubscriptionRelated
      ? `true (${r.extraction.rawServiceName ?? "?"})`
      : `false (${r.extraction?.notSubscriptionReason ?? "?"})`;

  console.log(`\n# Compare: ${basename(oldPath)} (${old.promptVersion}) → ${PROMPT_VERSION}\n`);

  console.log(`## true → false（期望：都是標記的 false positives）— ${trueToFalse.length} 筆\n`);
  console.log(`| id | subject | old | new |`);
  console.log(`|---|---|---|---|`);
  for (const [p, c] of trueToFalse)
    console.log(`| ${c.id} | ${trunc(c.subject, 50)} | ${reason(p)} | ${reason(c)} |`);

  console.log(`\n## false → true（⚠️ regression 或噪音，逐筆檢查）— ${falseToTrue.length} 筆\n`);
  console.log(`| id | subject | old | new |`);
  console.log(`|---|---|---|---|`);
  for (const [p, c] of falseToTrue)
    console.log(`| ${c.id} | ${trunc(c.subject, 50)} | ${reason(p)} | ${reason(c)} |`);

  console.log(`\n## 任一側 extract_failed（無法比較）— ${failedInvolved.length} 筆\n`);
  for (const [, c] of failedInvolved)
    console.log(`- ${c.id} ${trunc(c.subject, 50)}`);

  console.log(
    `\n不變：true→true ${stableTrue}、false→false ${stableFalse}；舊檔缺席 ${notInOld} 筆\n`,
  );
}

async function main() {
  const { file, compare, limit, concurrency, onlyTrue } = parseArgs();
  const path = file ?? newestFixture();
  const fixture = JSON.parse(readFileSync(path, "utf-8")) as Fixture;
  const emails = limit ? fixture.emails.slice(0, limit) : fixture.emails;

  const started = Date.now();
  const results = await pMap(emails, inspectOne, {
    concurrency,
    stopOnError: false,
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const summary = {
    total: results.length,
    blacklisted: results.filter((r) => flag(r) === "blacklisted").length,
    true: results.filter((r) => flag(r) === "true").length,
    false: results.filter((r) => flag(r) === "false").length,
    extractFailed: results.filter((r) => flag(r) === "failed").length,
  };

  const model = getModel();
  const report: InspectReport = {
    promptVersion: PROMPT_VERSION,
    model: typeof model === "string" ? model : model.modelId,
    fixture: basename(path),
    ranAt: new Date().toISOString(),
    args: { onlyTrue, limit: limit ?? null, concurrency },
    summary,
    results: onlyTrue ? results.filter((r) => flag(r) === "true") : results,
  };

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = join(OUT_DIR, `inspect-${PROMPT_VERSION}-${ts}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`Wrote ${outPath} (${elapsed}s, concurrency=${concurrency})`);
  console.log(
    `total=${summary.total} blacklisted=${summary.blacklisted} true=${summary.true} false=${summary.false} failed=${summary.extractFailed}`,
  );

  if (compare) printCompare(compare, results);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

設計備註（與 spec 的差異）：`outcome` 多了 `"blacklisted"` — fixture 含會被 production blacklist 擋掉的信，照 production 決策樹先擋（不浪費 token、保持保真度），spec 的 summary 也對應多 `blacklisted` 欄位。

- [ ] **Step 2: 刪掉舊 debug script**

```bash
rm scripts/debug-extractions.ts
```

（untracked、從未 commit；功能被 inspect-extractions.ts 完整取代。）

- [ ] **Step 3: Smoke test（5 封）**

```bash
npm run inspect:extractions -- --limit=5
```

Expected: 印出 `Wrote docs/extractions/inspect-v1-gemini-flash-zero-shot-<ts>.json` 與 summary 一行；JSON 檔內 `results` 有 ≤5 筆、每筆含完整 `body` 與 `extraction`。

- [ ] **Step 4: Smoke test `--only-true` 與 `--compare`**

```bash
npm run inspect:extractions -- --limit=5 --only-true
# 拿 Step 3 產出的檔案路徑當 compare 基準：
npm run inspect:extractions -- --limit=5 --compare=docs/extractions/inspect-v1-gemini-flash-zero-shot-<Step3的ts>.json
```

Expected: `--only-true` 的 JSON `results` 只含 `isSubscriptionRelated=true`（summary 仍是全量統計）；`--compare` 印出三組 markdown 表 + 不變統計（同版 prompt 重跑，理論上翻轉接近 0，零星 flip 即是 LLM 噪音的直接示範）。

- [ ] **Step 5: 確認輸出檔不會被 commit**

```bash
git status --short docs/extractions/ sampleEmail/
```

Expected: 無輸出（全部被 ignore）。

- [ ] **Step 6: Commit**

```bash
git add scripts/inspect-extractions.ts
git commit -m "feat: inspect-extractions tool with JSON output and --compare for prompt iteration"
```

---

### Task 3: 跑 v1 baseline + 人工標 false positives 【含人工參與點】

**Files:**
- Create: `docs/extractions/PROMPT_LOG.md`
- 產出（不 commit）: `docs/extractions/inspect-v1-gemini-flash-zero-shot-<ts>.json`

- [ ] **Step 1: 跑全量 baseline**

```bash
npm run inspect:extractions
```

Expected: 全 fixture（225 封）跑完不 crash，印出 summary。記下輸出檔路徑（之後 `--compare` 要用，**必須是全量、不是 --only-true 的檔**）。

- [ ] **Step 2: 建 `docs/extractions/PROMPT_LOG.md`**

```markdown
# Prompt Iteration Log

每版 prompt 改動與 inspect 對照結果。inspect-*.json 含個人 email 內文不 commit，
此檔只記 metadata（gmailMessageId、subject、pattern）。

---

## v1-gemini-flash-zero-shot — baseline (2026-06-11)

- 改動：無（zero-shot baseline，Week 3 Day 3 撰寫）
- Model: gemini-2.5-flash-lite
- Inspect: inspect-v1-gemini-flash-zero-shot-<ts>.json
- Summary: total=225, blacklisted=?, true=?, false=?, failed=?

### 人工標記 false positives

| gmailMessageId | Subject | Pattern（為什麼不是訂閱） |
|---|---|---|
| (待 user 標記) | | |
```

填入 Step 1 實際 summary 數字。

- [ ] **Step 3: 產生人工審查清單**

從 baseline JSON 拉出 `isSubscriptionRelated=true` 的精簡清單給 user 看：

```bash
cat docs/extractions/inspect-v1-gemini-flash-zero-shot-<ts>.json | \
  npx tsx -e '
    const r = JSON.parse(require("fs").readFileSync(0, "utf-8"));
    for (const x of r.results) {
      if (x.extraction?.isSubscriptionRelated) {
        const e = x.extraction;
        console.log(`- [${x.id}] ${x.subject}\n  from: ${x.from}\n  → ${e.rawServiceName} | ${e.amount} ${e.currency} ${e.cycle} | ${e.emailSignalType}`);
      }
    }'
```

（或直接開 JSON 檔人工看。）

- [ ] **Step 4: 🛑 STOP — user 標 false positives**

把 Step 3 清單呈給 user，由 user 逐筆判斷哪些是 false positive（不是訂閱卻被判 true）。**executor 不可代標。** 對看不出來的信，user 可用 `https://mail.google.com/mail/u/0/#all/<gmailMessageId>` 回 Gmail 看原信。

把 user 標記的結果（id + subject + pattern 一句話）填進 PROMPT_LOG.md 的表格。

- [ ] **Step 5: Commit**

```bash
git add docs/extractions/PROMPT_LOG.md
git commit -m "docs: v1 baseline extraction log with human-labeled false positives"
```

---

### Task 4: Prompt v2 — 收緊規則 + few-shot 負面範例

**Files:**
- Modify: `src/lib/extraction.ts`（只動 `PROMPT_VERSION` 與 `SYSTEM_PROMPT`）

⚠️ 範例內容取決於 Task 3 Step 4 user 標的 FP patterns — 以下是格式與組裝規則，pattern 文字從 PROMPT_LOG.md 的表格帶入。

- [ ] **Step 1: bump `PROMPT_VERSION`**

```typescript
export const PROMPT_VERSION = "v2-gemini-flash-fewshot-neg";
```

- [ ] **Step 2: 改 `SYSTEM_PROMPT`**

兩件事：

**(a) 收緊規則段** — 針對 FP patterns 把「不是訂閱（false）」清單補強。例如若 FP 集中在電商/外送收據，把該行改得更明確：

```
  - 單次購買與消費收據（外送訂單、電商出貨、餐廳/實體消費、單次加值），
    即使信內有「收據」「發票」「invoice」字樣 → one_time_purchase
```

實際措辭針對 PROMPT_LOG.md 記錄的 patterns 寫。

**(b) 字串尾端追加「判斷範例」區塊** — 每個 FP pattern 一個濃縮範例，格式固定：

```
判斷範例（以下都「不是」訂閱）：

範例 1：
Subject: <FP 信的實際 Subject（可簡化）>
重點：<一行：為什麼不是訂閱>
→ isSubscriptionRelated: false, notSubscriptionReason: <對應 enum>

範例 2：
...
```

組裝約束（spec 第 4 節）：
- 一個 pattern 一個範例，同 pattern 多封信只放一個代表
- 上限 5 個；超過代表 (a) 規則段該再改寫，不是繼續堆範例
- 只放 Subject + 一行重點 + 預期輸出，**不放 body**
- 只放負面範例

- [ ] **Step 3: 確認沒有測試 hardcode 舊版本字串**

```bash
grep -rn "v1-gemini" src/ scripts/
```

Expected: 無輸出（`PROMPT_VERSION` 都是 import 引用，無 hardcode）。若有，改成 import。

- [ ] **Step 4: 跑測試**

```bash
npm test
```

Expected: 全綠（既有測試用 mock model，不依賴 prompt 內容）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/extraction.ts
git commit -m "feat: prompt v2 — tighten isSubscriptionRelated rules + few-shot negative examples from labeled FPs"
```

---

### Task 5: 跑 v2 + compare 驗證 【含人工參與點】

**Files:**
- Modify: `docs/extractions/PROMPT_LOG.md`（追加 v2 紀錄）
- 產出（不 commit）: `docs/extractions/inspect-v2-gemini-flash-fewshot-neg-<ts>.json`

- [ ] **Step 1: 跑 v2 全量 + compare v1**

```bash
npm run inspect:extractions -- --compare=docs/extractions/inspect-v1-gemini-flash-zero-shot-<Task3的ts>.json
```

Expected: 印出三組翻轉表。

- [ ] **Step 2: 對照驗收標準**

逐項檢查 compare 輸出：

| 檢查 | 通過條件 |
|---|---|
| `true → false` 清單 | 大多數（理想全部）是 PROMPT_LOG.md 標記的 FP |
| 標記的 FP 但沒翻 | 殘留 FP — 記進 PROMPT_LOG，下輪迭代處理 |
| `true → false` 但**不在** FP 清單 | ⚠️ 疑似誤殺 — 進 Step 3 給 user 判 |
| `false → true` | ⚠️ 疑似 regression — 進 Step 3 給 user 判 |

噪音處理：任何非預期翻轉 1-2 筆時，先用同樣指令重跑一次，分辨是 prompt 造成還是 LLM 隨機性，不急著回滾。

- [ ] **Step 3: 🛑 STOP — user 確認翻轉清單**

把 Step 2 的對照結果呈給 user 確認：(1) 翻掉的都該翻、(2) **零筆真訂閱被誤殺**。任一不過 → 回 Task 4 Step 2 調整（修範例措辭或規則），版本號不再 bump（v2 還沒定稿），重跑本 Task。

- [ ] **Step 4: PROMPT_LOG.md 追加 v2 紀錄**

```markdown
## v2-gemini-flash-fewshot-neg (2026-06-11)

- 改動：<一句話：規則段改了什麼>；加 <N> 個負面範例（<pattern 列表>）
- Inspect: inspect-v2-gemini-flash-fewshot-neg-<ts>.json
- Summary: total=225, blacklisted=?, true=?, false=?, failed=?
- 對照 v1：
  - true→false：<N> 筆（其中標記 FP <N> 筆 ✅、非預期 <N> 筆）
  - false→true：<N> 筆
  - 誤殺真訂閱：0 ✅
- 殘留 FP：<N>（pattern: <...>，<下輪處理 / 接受>）
```

填實際數字。

- [ ] **Step 5: Commit**

```bash
git add docs/extractions/PROMPT_LOG.md
git commit -m "docs: v2 prompt iteration results — FP flips verified, zero true-positive regressions"
```

---

### Task 6: 端到端驗證（Verification Gate）

**Files:** 無新檔案 — 跑 spec 第 6 節的 gate。

- [ ] **Step 1: 測試全綠**

```bash
npm test
```

Expected: PASS（全部）。

- [ ] **Step 2: 🛑 user 手動 — Dashboard 重新 ingest**

User 操作：清空 DB（或接受 skipDuplicates 行為）→ Dashboard 點 [Ingest 90d to DB] → 對照 ingest stats 與 inspect v2 的 summary 量級一致（`not subscription` / `ingested` 比例相符；數字不必完全相等 — Dashboard 抓的是即時 Gmail 60 天、fixture 是 5/3 快照）。

確認 DB 裡的 Subscription 清單沒有 v1 時代的已知 FP 服務。若 DB 未清空、舊 FP BillingEvent 還在：記進 PROMPT_LOG.md 待辦（清理歸 Week 5 backfill 一起做），不在本次範圍。

- [ ] **Step 3: 核對 spec Verification Gate 清單**

| # | Gate | 狀態 |
|---|---|---|
| 1 | inspect tool 全 fixture 跑完不 crash、產出 JSON | Task 3 Step 1 ✅? |
| 2 | baseline FP 全數標記在 PROMPT_LOG.md | Task 3 Step 4 ✅? |
| 3 | ≥1 輪迭代：FP 多數翻轉、零誤殺 | Task 5 Step 3 ✅? |
| 4 | PROMPT_LOG.md 有 v1 + v2 紀錄 | Task 5 Step 4 ✅? |
| 5 | `npm test` 全綠 | Step 1 ✅? |
| 6 | Dashboard ingest 與 inspect 結論一致 | Step 2 ✅? |

全過 → Week 3 Day 5 完成。任一不過 → 回對應 Task。

---

## Self-review 紀錄

- Spec coverage：spec §2 迴圈 → Task 3-5；§3 tool → Task 2；§3 gitignore → Task 1；§4 prompt 規範 → Task 4；§4 PROMPT_LOG → Task 3/5；§6 gate → Task 6。無缺口。
- 已知的計畫內變數：Task 4 的範例內容依賴 Task 3 人工標記結果，plan 提供格式與組裝約束而非預寫內容（資料依賴，非 placeholder）。
- 型別一致性：`InspectReport` / `InspectResult` / `flag()` 只在 Task 2 單檔內使用；`PROMPT_VERSION` 跨 task 引用皆為 import。
