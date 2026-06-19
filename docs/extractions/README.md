# Extraction Eval Harness — 使用說明

這個資料夾是 LLM extraction 的 eval 基礎設施。核心是用一份**凍結的人工標準答案
（golden set）**，對每一版 prompt 的輸出算 precision / recall / F1 與 per-field
accuracy，讓「prompt 改了有沒有變好」從感覺變成數字。

> ⚠️ `inspect-*.json`、`eval-*.json`、`golden-set.json` 都含個人 email 內文，
> **不 commit**（見 `.gitignore`）。此資料夾只有 `README.md` 與 `PROMPT_LOG.md`
> 進版控。

相關 prompt 改版紀錄見 [PROMPT_LOG.md](./PROMPT_LOG.md)。

---

## 三個角色

| 元件 | 檔案 | 角色 | 比喻 |
|---|---|---|---|
| **造尺** | `src/lib/golden.ts` | 把預測轉成待審草稿、保住已審標註 | 出考卷 + 對答案 |
| **計分** | `src/lib/eval.ts` | 純函式，算 P/R/F1 + per-field | 計分公式 |
| **跑一次** | `scripts/run-eval.ts` | join golden + 預測、印報告、存檔 | 監考：收卷、對照、公布成績 |

`golden.ts` 與 `eval.ts` 都是**純函式**且有單元測試（`*.test.ts`）；script 只是薄
I/O 包裝。

---

## 資料流

```
        [一次性：造尺]                       [每次改 prompt：量分數]

 inspect-*.json (種子版預測)            inspect-*.json (待評版預測)
        │                                          │
        ▼                                          │
 buildGoldenDraft()  →  golden-set.json 草稿        │
        │                                          │
   人工審核改 golden、reviewed=true                  │
        │                                          ▼
        ▼                                   run-eval.ts
 golden-set.json (凍結的標準答案) ──────────► join by gmailId
        │                                          │
        └──────────────────────────────►   evaluate()
                                          P/R/F1 + per-field
                                                  │
                                                  ▼
                                   報告(stdout) + eval-*.json
```

左邊（造尺）只跑一次；右邊（量分數）每出一版 prompt 就跑一次。

---

## 日常操作

### 情境 A — 我寫好新版 prompt，想看有沒有進步（最常用）

```bash
# 1. 用新 prompt 在最新 fixture 上跑預測
npm run inspect:extractions

# 2. 對標凍結的 golden 算分（不給 --pred 就用最新 inspect-*.json）
npm run eval

# 3. 看報告：F1 vs 上一版？per-field 哪幾欄進步/退步？
```

指定某一份預測檔：

```bash
npm run eval -- --pred=docs/extractions/inspect-v3-....json
```

### 情境 B — 我要建立 / 擴充 golden set

```bash
npm run inspect:extractions   # 先跑出（新）信件的預測
npm run golden:draft          # 併進 golden-set.json，舊的 reviewed 標註會保留
# → 打開 golden-set.json，逐筆審核：改 golden 欄位、把 reviewed 改 true
```

`golden:draft` 預設讀最新 `inspect-*.json` 當草稿底，寫到
`docs/extractions/golden-set.json`。可用 `--from=` / `--out=` 覆寫。

---

## golden-set.json 三個欄位的命運

| 欄位 | 造草稿時 | 人工審核時 | **跑 eval 時** |
|---|---|---|---|
| `llmGuess` | 寫入（=種子版預測） | 看它對照 | **忽略** |
| `golden` | 預填 = llmGuess | **改這個**（真理） | **當標準答案讀** |
| `reviewed` | `false` | 改 `true` | 篩選條件（只取 true） |

**重點：跑 eval 時預測一律從外部 `inspect-*.json` 即時讀，不會用 `llmGuess`。**
`llmGuess` 只是種子版的凍結快照，純供人工審核對照；若拿它當預測，會永遠在評種子
版而非當下版本。

---

## 不變條件（踩雷區）

1. **golden 凍結**：審核完就不隨 prompt 改動。跨版本比較有意義的前提是大家量同一把尺。
2. **同一份 fixture**：要評的每一版都必須在 **golden 綁定的那份 fixture** 上重跑
   `inspect:extractions`。run-eval 會用 gmailId join，對不上的算 `unmatched` 並警告
   —— `unmatched` 很大代表預測檔跟 golden 不同源，分數不可比。
3. **只信 reviewed**：run-eval 只取 `reviewed:true` 的筆當事實；沒審的不計入。
4. **預測來源即時**：預測來自 `--pred` 指定的 inspect 檔，不是 golden 裡的 llmGuess。

---

## 指標定義

**Binary（`isSubscriptionRelated`）** — 看混淆矩陣：

- **Precision** = TP / (TP+FP)：判為訂閱的有幾成是真的（低 = FP 多 = 髒資料入庫）
- **Recall** = TP / (TP+FN)：真訂閱抓到幾成（低 = FN 多 = 漏抓訂閱）
- **F1** = 2·P·R / (P+R)：調和平均，任一邊低就被拉低，版本比較的單一主指標

**Per-field accuracy（amount / cycle / emailSignalType…）**：

- **只在 true-positive 上算**：把偵測失敗（已由 recall 衡量）和抽取失敗分開，不重複懲罰。
- **抓得到幻覺**：golden 沒標、模型卻填了（如 billing 信冒出 `trialEndsAt`）→ 算 mismatch。
- 比對規則：數字精確、字串大小寫不敏感、兩邊皆空視為相等。

---

## 檔案對照

| 檔案 | 說明 |
|---|---|
| `src/lib/golden.ts` / `.test.ts` | `buildGoldenDraft()` 純函式 + 測試 |
| `src/lib/eval.ts` / `.test.ts` | `evaluate()` 計分純函式 + 測試 |
| `scripts/inspect-extractions.ts` | 跑 LLM 預測，產 `inspect-*.json`（`npm run inspect:extractions`） |
| `scripts/build-golden-draft.ts` | 造 / 更新 golden 草稿（`npm run golden:draft`） |
| `scripts/run-eval.ts` | 算分並印報告（`npm run eval`） |
| `docs/extractions/golden-set.json` | 凍結的標準答案（gitignored） |
| `docs/extractions/eval-*.json` | 每次 eval 的完整報告（gitignored） |
