# Prompt Iteration Log

每版 prompt 改動與 inspect 對照結果。inspect-*.json 含個人 email 內文不 commit，
此檔只記 metadata（gmailMessageId、subject、pattern）。

---

## v1-gemini-flash-zero-shot — baseline (2026-06-11)

- 改動：無（zero-shot baseline，Week 3 Day 3 撰寫）
- Model: gemini-2.5-flash-lite
- Inspect: inspect-v1-gemini-flash-zero-shot-2026-06-11T09-56-21.json
- Summary: total=225, blacklisted=0, true=20, false=205, failed=0

### 人工標記 false positives（user 標記，2026-06-11）

| gmailMessageId | Subject | Pattern（為什麼不是訂閱） |
|---|---|---|
| 19d74e41ad77826b | 信用卡帳單繳款通知（中國信託） | 信用卡月結帳單：多筆消費彙總，非單一服務的訂閱費 |
| 19cd582e27556bb7 | 信用卡帳單繳款通知（中國信託） | 同上（同 pattern 第二封） |
| 19cf4ea49a844448 | 台股定期定額買股預先圈存(或預收)款項通知書（富邦證券） | 定期定額投資扣款：雖然每月定期，但是投資不是服務訂閱 |
| 19cd4fa660670e02 | Important – AWS Invoice e-mail address changes | 帳務行政通知：無扣款事件，只是設定變更通知 |

Pattern 歸納（3 個）：
1. **信用卡/銀行月結帳單** — 「帳單」「繳款」字樣但是消費彙總
2. **定期定額投資扣款** — 證券/基金的定期扣款
3. **帳務行政通知** — 與帳單相關但無實際扣款事件

邊界判定紀錄（user 裁定，**不是** FP）：
- 電信月租帳單（台灣大哥大/遠傳）→ **是訂閱**（schema 本有 comm category）
- trial 結束提醒（Google One 新用戶優惠將結束）→ **是訂閱**：試用期是訂閱
  生命週期的一部分，只是還沒開始付費
