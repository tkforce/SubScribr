# Week 3 Day 5 — 抽取品質檢查與 Prompt 迭代 (Design Spec)

- **Date**: 2026-06-11
- **Phase**: v7 Week 3 Day 5（re-scoped）
- **Goal**: 建立「人工檢查 → 調 prompt → 重跑驗證」的迭代迴圈，修正 `isSubscriptionRelated` 的 false positive（LLM 判 true 但人為判斷不是訂閱信）。
- **Non-goal**: 量化 eval / golden set（Week 4）、production code 重構、alias backfill（Week 5）。

---

## 1. 問題定義

`isSubscriptionRelated` 是 binary gate：false → 完全不寫 DB。實際跑過真實
Gmail 後發現的問題是 **false positive** — 有些信 LLM 判 `true`，但人工看
明顯不是訂閱（例如單次消費收據、發票通知）。這些會變成髒的 BillingEvent
與幽靈 Subscription。

調整手段（user 已選定兩個 lever）：

1. **收緊 SYSTEM_PROMPT 判斷規則**（規則段改寫）
2. **加 few-shot 負面範例**（從真實 false positive 反推）

不動 production code 結構 — `llmExtract` / `ExtractionSchema` / gate 邏輯
維持原樣，只迭代 prompt 內容 + bump `PROMPT_VERSION`。

---

## 2. 核心迭代迴圈

```
┌──────────────────────────────────────────────────────┐
│ 1. inspect tool 跑 fixture                            │
│    → docs/extractions/inspect-<version>-<ts>.json     │
│                                                       │
│ 2. 人工看 isSubscriptionRelated=true 的清單            │
│    標出 false positives（記 email id + pattern）       │
│                                                       │
│ 3. 改 SYSTEM_PROMPT：                                 │
│    - 收緊規則段                                        │
│    - 把 false positive pattern 寫成 few-shot 負面範例   │
│    - bump PROMPT_VERSION (v1 → v2 → ...)              │
│                                                       │
│ 4. 重跑 + --compare=<舊 json>                          │
│    確認：標的 FP 翻成 false、true positive 零誤殺        │
│                                                       │
│ 5. 還有 FP？ → 回到 2                                  │
└──────────────────────────────────────────────────────┘
```

---

## 3. Inspection Tool

### 來源與保真度

由 `scripts/debug-extractions.ts` 演化而來（改寫同一個檔案或新檔取代，
plan 階段決定）。**直接 import production 的 `SYSTEM_PROMPT`、
`ExtractionSchema`、`getModel()`、`formatUserPrompt`** — 工具看到的行為
就是 ingestion 看到的行為，不存在「工具上調好了、production 不一樣」。

### 介面

```bash
npm run inspect:extractions                        # 最新 fixture 全跑
npm run inspect:extractions -- --only-true         # 只輸出 isSubscriptionRelated=true
npm run inspect:extractions -- --limit=30          # smoke test
npm run inspect:extractions -- --file=path.json
npm run inspect:extractions -- --concurrency=20
npm run inspect:extractions -- --compare=docs/extractions/inspect-v1-....json
```

### 輸出（JSON）

`docs/extractions/inspect-<PROMPT_VERSION>-<timestamp>.json`：

```jsonc
{
  "promptVersion": "v1-gemini-flash-zero-shot",
  "model": "gemini-2.5-flash-lite",
  "fixture": "subscribr-emails-20260503-1557.json",
  "ranAt": "2026-06-11T...",
  "summary": {
    "total": 225,
    "true": 18,
    "false": 200,
    "extractFailed": 7
  },
  "results": [
    {
      "id": "<gmailMessageId>",
      "from": "...",
      "subject": "...",
      "snippet": "...",
      "body": "...",            // 人工判斷需要全文
      "outcome": "extracted",   // extracted | extract_failed
      "extraction": { /* 完整 Extraction object */ },
      "error": null             // extract_failed 時填 errorName + message
    }
  ]
}
```

注意：fixture 的 body 本來就在本機 JSON 裡，inspect 輸出含 body 不違反
privacy-by-design（那條約束是「不落 DB」）。但 `docs/extractions/inspect-*.json`
含個人 email 內文，**加進 .gitignore，不 commit**。

### `--compare` 行為

讀舊 JSON，以 email id join，輸出三組到 stdout（markdown table）：

| 組 | 意義 | 期望 |
|---|---|---|
| `true → false` | 翻轉 | 應該都是你標的 false positives |
| `false → true` | 反向翻轉 | ⚠️ 通常是 regression 或噪音，逐筆檢查 |
| 任一側 extract_failed | 無法比較 | 列出供參考 |

不變的（true→true、false→false）只給 count 不列明細。

---

## 4. Prompt 改動規範

### Few-shot 負面範例格式

放 SYSTEM_PROMPT 字串尾端（規則段之後），新增「判斷範例」區塊：

```
判斷範例（以下都「不是」訂閱）：

範例 1：
Subject: 您的 Uber Eats 訂單收據
重點：單次外送訂單，有「收據」字樣但非定期扣款
→ isSubscriptionRelated: false, notSubscriptionReason: one_time_purchase
```

約束：

- **濃縮版**：Subject + 一行「為什麼不是」+ 預期輸出。不放完整 body
  （5 個完整 body 會讓 system prompt 比 email 還大）。
- **一個 pattern 一個範例**：同 pattern 多封信只放一個代表。
- **上限 ~5 個**：超過代表規則段該改寫，範例是 patch、規則才是 fix。
- **只放負面範例**：現在的問題是 FP；正面案例 LLM 已抓得不錯。

### PROMPT_VERSION

任何 prompt 改動（規則或範例）都 bump：`v1-gemini-flash-zero-shot` →
`v2-gemini-flash-fewshot-neg` → ...。BillingEvent 存 promptVersion，
可追溯每批資料是哪版抽的。

### 版本紀錄

每輪迭代在 `docs/extractions/PROMPT_LOG.md` 追加一段（這份 **要 commit**）：

```markdown
## v2-gemini-flash-fewshot-neg (2026-06-11)

- 改動：收緊 one_time_purchase 規則；加 2 個負面範例（Uber Eats、發票通知）
- 對照：inspect-v1 → inspect-v2
- 翻轉 true→false：5 筆（全部是標記的 FP ✅）
- 翻轉 false→true：0 筆
- 殘留 FP：1（pattern: ...，下輪處理）
```

這是 v7 spec「prompt versioning + 每版 eval 結果記錄」的最小實作，
Week 4 eval harness 直接接手升級成量化指標。

---

## 5. 測試策略

- Inspection tool 是 dev script，不寫 unit test（與 debug-extractions.ts 同等地位）。
- `SYSTEM_PROMPT` 改動不需新測試 — 既有 `extraction.test.ts` 用 mock model，
  不依賴 prompt 內容。
- `PROMPT_VERSION` bump 後跑 `npm test` 確認沒有測試 hardcode 舊版本字串。
- 品質驗證靠 `--compare` 人工迴圈（第 6 節），Week 4 才量化。

---

## 6. Verification Gate（Day 5 done 條件）

1. ✅ inspect tool 跑完全部 fixture 不 crash，產出 JSON
2. ✅ 人工標出 baseline 中所有 false positives（記錄在 PROMPT_LOG.md）
3. ✅ 至少完成一輪 prompt 迭代（v2），`--compare` 顯示：
   - 標記的 FP 大多數翻成 false
   - **零筆**人工認定的 true subscription 被翻掉
4. ✅ PROMPT_LOG.md 有 v1 baseline + v2 紀錄
5. ✅ `npm test` 全綠
6. ✅ Dashboard [Ingest] 用新 prompt 重跑，DB 結果與 inspect 結論一致

噪音提醒：LLM 有隨機性，同版 prompt 兩次跑可能零星 flip。看到 1-2 筆
非預期 flip 先重跑確認是 prompt 造成還是噪音，不急著回滾。

---

## 7. Out of Scope

- 量化 accuracy / precision / recall（Week 4 eval harness）
- Golden set 標註（Week 4；但這次標的 FP 清單是 Week 4 的種子）
- `llmExtract` 拆分 / gate 邏輯重構（user 已否決 — 不需要）
- 正面 few-shot 範例（等 Week 5 看 failure pattern）
- temperature / seed 調參（先用 SDK 預設）
- 自動化 FP 偵測（人工判斷就是這步的本質）

---

## 8. 後續銜接

- **Week 4**：本次標註的 FP 清單 + inspect JSON 直接成為 golden set 種子；
  `--compare` 的人工對照升級為 per-field metric script。
- **Week 5**：inspect JSON 的 rawServiceName 分布做 alias 反推 backfill；
  正面 few-shot 範例補強。
