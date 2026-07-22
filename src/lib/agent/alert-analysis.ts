import { z } from "zod";
import { generateText, generateObject, stepCountIs } from "ai";
import type { LanguageModel } from "ai";
import { getModel } from "@/lib/llm";
import { buildAgentTools } from "@/lib/agent/tools";
import { detectAnomalies, type AnomalyReport } from "@/lib/queries/anomalies";

// Section 8a「本週需要注意」— the anomaly-driven alert flow.
//
// Two-phase by design: phase 1 lets the agent freely investigate with the four
// tools and write a natural-language analysis; phase 2 constrains that analysis
// into renderable priority cards. Each phase uses a mode already proven with
// Gemini in this repo (generateText+tools in the CLI; generateObject in
// extraction.ts) — we deliberately avoid the experimental single-call path that
// mixes function calling with a response schema.

// ---------- Output schema (phase 2 constraint) ----------

export const AlertCardSchema = z.object({
  // 🔴 high / 🟡 medium / 🟢 low
  priority: z.enum(["high", "medium", "low"]),
  serviceName: z.string(),
  title: z.string(), // 一句話標題，例：「Netflix 漲價 60 元」
  detail: z.string(), // 具體說明，含數字與幣別
  // 保留 / 稍後提醒 / 前往取消
  suggestedAction: z.enum(["keep", "remind_later", "go_cancel"]),
});

export const AlertCardsSchema = z.object({
  cards: z.array(AlertCardSchema),
});

export type AlertCard = z.infer<typeof AlertCardSchema>;
export type AlertCards = z.infer<typeof AlertCardsSchema>;

// ---------- Pure helpers ----------

const PRIORITY_RANK: Record<AlertCard["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

// High → medium → low. Array.prototype.sort is stable (ES2019+), so cards of the
// same priority keep the order the model produced them in.
export function sortCardsByPriority(cards: AlertCard[]): AlertCard[] {
  return [...cards].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
}

// Cost gate: if the deterministic scan found nothing, there is nothing for the
// LLM to judge — skip both phases entirely and return an empty result.
export function hasActionableSignal(report: AnomalyReport): boolean {
  return Boolean(
    report.duplicates?.length ||
      report.idle?.length ||
      report.priceChanges?.length ||
      report.upcomingRenewals?.length,
  );
}

// ---------- Prompts ----------

const PHASE1_SYSTEM = `你是訂閱管理顧問，任務是找出「本週使用者真正需要注意」的事，而不是聊天。
系統已經先跑過異常偵測，會把偵測到的事實（JSON）給你當起點。你的工作：
- 用 get_service_info 查該服務的公開定價與漲價史，判斷金額是否合理、漲幅是否顯著。
- 用 calculate_trend 看整體或單一服務的花費變化幅度。
- 用 query_subscriptions 確認使用者目前的訂閱現況。
- 綜合判斷哪些事實「真的值得注意」（例如：同分類兩個影音訂閱不一定是問題；
  但一個三個月沒扣款的服務可能已在外部取消、卻還顯示 active，值得提醒）。

判斷時請注意：
- 漲價才是警示訊號；降價通常是好消息或中性，除非它代表使用者不知情的方案降級，
  否則不要當成需要注意的事。
- 帳單金額本來就會浮動的服務（電信、水電這類用量／分期計費），金額變動很常見，
  不要只因為金額波動就當成問題。
- 對於 get_service_info 查不到的服務（found:false，例如本地電信），你沒有定價知識，
  不要臆測「金額異常」或「不合理」，只描述事實、標記為需使用者自行確認。

輸出一段繁體中文分析，每個值得注意的項目都要有具體數字與幣別、以及你建議使用者怎麼做。
每一個數字都必須來自某個 tool 的回傳結果——沒有從 tool 查到的金額、日期、方案，
一律不要寫出來，絕對不要編造或推測數字。`;

const PHASE2_SYSTEM = `把下面這段訂閱分析整理成一組「需要注意」卡片，依 schema 輸出。
規則：
- 一張卡片對應一個具體項目，不要把多件事塞進同一張。
- priority：
  - high 🔴：只留給「明確正在或即將損失金錢、需要盡快決定」的情況（顯著漲價、
    可能已取消卻仍在收費、即將扣款的閒置服務）。沒有把握的事不要給 high。
  - medium 🟡：值得檢視但不急、或帶有不確定性（可能重複的訂閱、小幅漲價、
    需要使用者自己確認的波動）。
  - low 🟢：純資訊提醒（一般的即將續約）。
- suggestedAction（go_cancel 門檻很高）：
  - go_cancel 前往取消：只有你有把握「這確實是浪費、應該退訂」時才用。任何帶有
    「可能／疑似／不確定／需確認」的項目，一律用 remind_later，不要用 go_cancel。
  - remind_later 稍後提醒：值得看但現在不用決定、或不確定的項目。
  - keep 保留：確認合理、留著即可。
- 降價不是警示：某服務變便宜是好消息或中性，最多 low + keep，不要因為降價建議取消。
- 帳單本來就會浮動的服務（電信、水電等用量／分期計費），不要只因金額變動就叫人取消，
  給 medium + remind_later 讓使用者自己看。
- title 一句話，detail 要帶具體數字與幣別。
- 全部用繁體中文。如果分析裡其實沒有值得注意的事，回傳空的 cards 陣列。`;

// ---------- Orchestrator ----------

export async function runWeeklyAlertAnalysis(
  userId: string,
  model: LanguageModel = getModel(),
): Promise<AlertCards> {
  const report = await detectAnomalies(userId);

  // Gate: nothing detected → no LLM call, clean empty state.
  if (!hasActionableSignal(report)) {
    return { cards: [] };
  }

  // Phase 1: agent investigates with tools, produces a free-text analysis.
  const { text } = await generateText({
    model,
    system: PHASE1_SYSTEM,
    prompt:
      `今天是 ${new Date().toISOString().slice(0, 10)}。\n` +
      `系統偵測到的異常事實（JSON）：\n${JSON.stringify(report)}\n\n` +
      `請佐證後，寫出本週值得注意的分析。`,
    tools: buildAgentTools(userId),
    stopWhen: stepCountIs(8),
  });

  // Phase 2: constrain the analysis into renderable cards (proven Gemini path).
  const { object } = await generateObject({
    model,
    schema: AlertCardsSchema,
    system: PHASE2_SYSTEM,
    prompt: text,
    temperature: 0,
  });

  return { cards: sortCardsByPriority(object.cards) };
}
