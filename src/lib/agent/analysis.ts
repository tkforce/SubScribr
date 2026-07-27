import { z } from "zod";
import { streamText, generateObject, stepCountIs } from "ai";
import type { LanguageModel } from "ai";
import { getModel } from "@/lib/llm";
import { buildAgentTools } from "@/lib/agent/tools";
import { detectAnomalies } from "@/lib/queries/anomalies";
import {
  computeMonthDelta,
  getMonthlyTrend,
} from "@/lib/queries/monthly-trend";
import {
  computeOverview,
  getActiveSubscriptions,
} from "@/lib/queries/subscriptions";
import {
  toToolProgressEvent,
  extractStreamError,
  type StreamChunkLike,
  type ToolProgressEvent,
} from "@/lib/agent/stream-events";
import {
  buildFlowUsage,
  buildStepBreakdown,
  tokensOf,
  type FlowUsage,
} from "@/lib/agent/usage";

// The single AI dashboard section, merged from what were separately 8a
// 「本週需要注意」and 8b「本月分析」.
//
// They were split in the plan, but built out they investigated the same
// BillingEvent log with the same four tools and reported the same facts twice
// in different words — a price change is both an anomaly and a monthly change.
// One agent run sees every fact at once, so it dedupes by construction and
// costs roughly half. Both sections collapsed into one ranked `insights` list:
// 8a's alerts, 8b's monthly changes, and 8b's cross-cutting narrative are now
// just different `kind`s of the same card.

// ---------- Output schema (phase 2 constraint) ----------

export const InsightSchema = z.object({
  // alert 需要注意 / change 本月變動 / observation 跨服務的模式
  kind: z.enum(["alert", "change", "observation"]),
  // 🔴 high / 🟡 medium / 🟢 low
  priority: z.enum(["high", "medium", "low"]),
  serviceName: z.string(),
  title: z.string(), // 一句話標題，例：「Netflix 漲價 60 元」
  detail: z.string(), // 具體說明，含數字與幣別
  // 一句話建議，緊貼著它所對應的那個事實。純敘述事實的項目可以沒有。
  suggestion: z.string().optional(),
});

// Just a headline and a list. An earlier version also had `observation` and
// `recommendations` as separate prose blocks, but they restated the cards:
// recommendations were per-item advice, which is the same axis the cards
// already cover. Cross-cutting patterns (the one thing prose could say that a
// card couldn't) are now kind:"observation" cards, and per-item advice moved
// into each card's own `suggestion`, next to the fact it is about.
export const AnalysisSchema = z.object({
  headline: z.string(), // 一句話 TL;DR，整個區塊最上面
  insights: z.array(InsightSchema), // 程式端排序並截到 5 則
});

export type Insight = z.infer<typeof InsightSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;

export type AnalysisResult = {
  analysis: Analysis | null;
  usage: FlowUsage | null;
};

// SSE progress events for the streaming route.
export type AnalysisEvent =
  | { type: "progress"; message: string }
  | ToolProgressEvent
  | { type: "done"; analysis: Analysis | null; usage: FlowUsage | null }
  | { type: "error"; message: string };

// ---------- Pure helpers ----------

const PRIORITY_RANK: Record<Insight["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

// High → medium → low. Array.prototype.sort is stable (ES2019+), so insights
// of the same priority keep the order the model produced them in.
export function sortInsightsByPriority(insights: Insight[]): Insight[] {
  return [...insights].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
}

// Structured outputs can't express an array maxItems, so the caps live here.
// Sorting before slicing means a cap drops the least urgent items, not
// whichever ones the model happened to emit last.
export function capInsights(insights: Insight[], n = 5): Insight[] {
  return sortInsightsByPriority(insights).slice(0, n);
}

export function toAnalysisStreamEvent(
  chunk: StreamChunkLike,
): AnalysisEvent | null {
  return toToolProgressEvent(chunk);
}

// ---------- Prompts ----------

// Bump when the prompts or output schema change, mirroring the ingestion
// pipeline's PROMPT_VERSION. Stored alongside each analysis so a persisted
// result can be traced back to the generation that produced it.
export const ANALYSIS_PROMPT_VERSION = "v2-cards-only";

const PHASE1_SYSTEM = `你是訂閱管理顧問，任務是給使用者一份「現在該知道什麼」的訂閱回顧，而不是聊天。
系統會先給你三樣東西當起點：異常偵測的結果（JSON）、最近 6 個月的支出趨勢、以及與上月的比較。
你的工作是把「需要注意的事」和「本月的變化」放在一起看，寫成一份完整的回顧：
- 用 get_service_info 查該服務的公開定價與漲價史，判斷金額是否合理、漲幅是否顯著。
- 用 calculate_trend 看整體或單一服務的花費變化幅度。
- 用 detect_anomalies 補查重複、閒置、漲價、即將續約。
- 用 query_subscriptions 確認使用者目前的訂閱現況。
- 綜合判斷哪些事實「真的值得講」（例如：同分類兩個影音訂閱不一定是問題；
  但一個三個月沒扣款的服務可能已在外部取消、卻還顯示 active，值得提醒）。

判斷時請注意：
- 漲價才是警示訊號；降價通常是好消息或中性，除非它代表使用者不知情的方案降級，
  否則不要當成需要注意的事。
- 帳單金額本來就會浮動的服務（電信、水電這類用量／分期計費），金額變動很常見，
  不要只因為金額波動就當成問題。
- 對於 get_service_info 查不到的服務（found:false，例如本地電信），你沒有定價知識，
  不要臆測「金額異常」或「不合理」，只描述事實、標記為需使用者自行確認。
- 同一件事只講一次。漲價既是「需要注意」也是「本月變動」，選一個角度講清楚就好。
- 講「取消 X 可以省下多少錢」時，金額只能是 X 自己的月費。同分類多個服務的**合計金額
  不是可節省金額** —— 使用者取消其中一個，省下的是那一個的錢，不是全部。合計金額只能
  用來描述「這個分類總共花了多少」，絕對不能寫成「取消就能省下合計金額」。
- 同分類出現多個服務不代表浪費。兩個電信可能是家人的門號、兩個雲端可能用途不同，
  你從帳單看不出來哪個該砍。這種事只能提醒使用者自己確認，不能斷定是重複浪費。

工具使用效率：**一次把需要的資料查齊**。要查 4 個服務的定價，就在同一輪一次發出 4 個
get_service_info，不要查完一個再查下一個。每多一輪往返都會重送一次完整對話，成本以
倍數累積。你最多只有 8 輪，用光就會被強制中斷、來不及寫結論。

輸出一段繁體中文回顧，涵蓋兩件事：值得注意或本月改變的具體項目（每項附上你建議使用者
怎麼做或該考量什麼），以及一個使用者可能沒注意到的跨服務模式（例如某分類佔比上升）。
每個項目都要有具體數字與幣別。
每一個數字都必須來自某個 tool 的回傳結果——沒有從 tool 查到的金額、日期、方案，
一律不要寫出來，絕對不要編造或推測數字。`;

const PHASE2_SYSTEM = `把下面這段訂閱回顧整理成結構化輸出，依 schema 輸出。

headline：一句話總結整個月的狀況，要有具體數字（例如「本月支出增加 NT$106，主要來自 Cursor 漲價；
有 2 件事需要注意」）。這是使用者唯一保證會讀的一行。
**如果你在 headline 裡寫「有 N 件事需要注意」，N 必須等於你實際輸出的 insights 則數。**
沒把握就不要寫數字，改用「支出小幅上升」這類描述。

insights：整個區塊只有這一份清單，所有內容都要放進來。每則對應一個具體項目，不要把
多件事塞進同一則。同一件事只出現一次。最多 5 則，其中 observation 最多 1 則。
- kind：
  - alert 需要注意：可能正在損失金錢、或狀態不對需要使用者確認的事。
  - change 本月變動：這個月新增、取消、金額改變的事實陳述。
  - observation 觀察：**跨服務或跨時間的整體模式**，例如「AI 類訂閱三個月內從 1 個變成
    3 個，佔月支出 52%」。這則講的必須是多個服務合起來代表什麼，不能只是把某一則
    alert 換句話說。沒有這種整體模式就不要硬寫。
- priority：
  - high 🔴：只留給「明確正在或即將損失金錢、需要盡快決定」的情況（顯著漲價、
    可能已取消卻仍在收費、即將扣款的閒置服務）。沒有把握的事不要給 high。
  - medium 🟡：值得檢視但不急、或帶有不確定性（可能重複的訂閱、小幅漲價、
    需要使用者自己確認的波動）。
  - low 🟢：純資訊提醒（一般的即將續約、單純的金額變動陳述）。
  - **同分類多個服務（疑似重複）要當成一則 insight 留在清單裡，給 medium。** 但不可以
    給 high：你無法從帳單判斷那是浪費還是各有用途（家人門號、不同用途的雲端空間），
    本質上不確定的事不該用最高優先級去催促使用者。
- 降價不是警示：某服務變便宜是好消息或中性，最多 low，不要因為降價建議取消。
- 帳單本來就會浮動的服務（電信、水電等用量／分期計費），不要只因金額變動就叫人取消，
  給 medium 讓使用者自己看。
- title 一句話，detail 要帶具體數字與幣別。
- 真的沒有值得講的事就回傳空陣列。

suggestion（一句話，寫在該則卡片裡；純陳述事實的項目可以不給）：
- 要具體到使用者知道下一步做什麼或該考量什麼。好的例子：
  「考量您是否確實需要同時訂閱「台灣大哥大」與「遠傳電信」兩項服務。」
  「到 Netflix 官網確認這筆訂閱是否已經取消，避免持續扣款。」
- **絕對不要提到本產品沒有的功能。** 沒有提醒、排程、代為取消、一鍵退訂這些功能，
  所以不可以寫「稍後提醒您」「我們會在扣款前通知」這類句子。你只能建議使用者自己
  去做什麼、或自己去確認什麼。
- 不要寫「保留」「稍後再看」這種等於沒講的話。沒有具體建議就不要給 suggestion。
- 提到可節省金額時，只能寫該服務自己的月費。**同分類服務的合計金額不是可節省金額** ——
  「取消兩個電信其中一個以節省合計 841 TWD」是錯的，取消一個只會省下那一個的錢。

全部用繁體中文。`;

// ---------- Orchestrator ----------

export async function runAnalysis(
  userId: string,
  model: LanguageModel = getModel(),
  onEvent?: (event: AnalysisEvent) => void,
): Promise<AnalysisResult> {
  const subs = await getActiveSubscriptions(userId);

  // Gate: a user with no active subscriptions has nothing to review — skip
  // both LLM phases entirely. Note this is the *only* gate: unlike the old 8a,
  // we no longer skip when the anomaly scan comes back empty, because a month
  // with no anomalies still has a spending review worth writing.
  if (subs.length === 0) {
    onEvent?.({ type: "done", analysis: null, usage: null });
    return { analysis: null, usage: null };
  }

  onEvent?.({ type: "progress", message: "整理訂閱資料中..." });

  const [report, trend] = await Promise.all([
    detectAnomalies(userId),
    getMonthlyTrend(userId, 6),
  ]);
  const delta = computeMonthDelta(trend);
  const { totalMonthlyTwd } = computeOverview(
    subs.map((s) => ({ cycle: s.cycle, amountInTwd: s.amountInTwd })),
  );

  onEvent?.({ type: "progress", message: "分析訂閱狀況中..." });

  // Phase 1: one agent investigation over both the anomaly facts and the
  // monthly trend. streamText (not generateText) so fullStream's
  // tool-call/tool-result chunks can be surfaced as progress events.
  const phase1 = streamText({
    model,
    system: PHASE1_SYSTEM,
    prompt:
      `今天是 ${new Date().toISOString().slice(0, 10)}。\n` +
      `本月估算月支出：${totalMonthlyTwd} TWD（${subs.length} 個使用中訂閱）。\n` +
      `系統偵測到的異常事實（JSON）：\n${JSON.stringify(report)}\n` +
      `最近 6 個月趨勢（TWD）：${JSON.stringify(trend)}\n` +
      `與上月比較：${JSON.stringify(delta)}\n\n` +
      `請佐證後，寫出這份訂閱回顧。`,
    tools: buildAgentTools(userId),
    stopWhen: stepCountIs(8),
  });

  // Failures arrive as chunks, not as a rejected iteration. Dropping them
  // (which is what happens if you only look for tool activity) lets the loop
  // finish normally with zero steps, and the first `await phase1.*` below then
  // throws "No output generated. Check the stream for errors." — a message
  // that names neither the cause nor the layer. Capture the real one instead.
  let fatal: string | null = null;
  for await (const chunk of phase1.fullStream) {
    const failure = extractStreamError(chunk);
    if (failure) {
      // Logged either way: a tool that failed without sinking the run still
      // explains a thin analysis, and there is no other server-side record.
      console.error("[analysis] phase 1 stream failure:", failure.message);
      if (failure.fatal) fatal ??= failure.message;
      continue;
    }
    const event = toAnalysisStreamEvent(chunk);
    if (event) onEvent?.(event);
  }
  if (fatal) throw new Error(`分析中斷：${fatal}`);

  onEvent?.({ type: "progress", message: "整理分析結果中..." });

  // Phase 2: constrain the review into the renderable structure (proven
  // Gemini path).
  const phase2 = await generateObject({
    model,
    schema: AnalysisSchema,
    system: PHASE2_SYSTEM,
    prompt: await phase1.text,
    temperature: 0,
  });

  const analysis: Analysis = {
    ...phase2.object,
    insights: capInsights(phase2.object.insights),
  };
  const usage = buildFlowUsage(
    tokensOf(await phase1.totalUsage),
    tokensOf(phase2.usage),
    buildStepBreakdown(await phase1.steps),
  );

  onEvent?.({ type: "done", analysis, usage });
  return { analysis, usage };
}
