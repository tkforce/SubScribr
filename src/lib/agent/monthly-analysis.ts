import { z } from "zod";
import { generateText, generateObject, stepCountIs } from "ai";
import type { LanguageModel } from "ai";
import { getModel } from "@/lib/llm";
import { buildAgentTools } from "@/lib/agent/tools";
import {
  computeMonthDelta,
  getMonthlyTrend,
} from "@/lib/queries/monthly-trend";
import {
  computeOverview,
  getActiveSubscriptions,
} from "@/lib/queries/subscriptions";
import {
  buildFlowUsage,
  buildStepBreakdown,
  tokensOf,
  type FlowUsage,
} from "@/lib/agent/usage";

// Section 8b「本月分析」— the reflective monthly review.
//
// Same two-phase shape as 8a (see alert-analysis.ts), but anchored on the
// month-over-month trend rather than anomalies, and its phase-2 output is a
// three-part narrative (top changes / observation / recommendations) instead
// of decision cards.

// ---------- Output schema (phase 2 constraint) ----------

export const MonthlyChangeSchema = z.object({
  serviceName: z.string(),
  summary: z.string(), // 一行：這個服務本月怎麼變（含數字與幣別）
});

export const MonthlyAnalysisSchema = z.object({
  topChanges: z.array(MonthlyChangeSchema), // 本月主要變動（程式端截到 TOP 3）
  observation: z.string(), // AI 觀察：一段自然語言敘事
  recommendations: z.array(z.string()), // 建議：1–2 個具體行動
});

export type MonthlyChange = z.infer<typeof MonthlyChangeSchema>;
export type MonthlyAnalysis = z.infer<typeof MonthlyAnalysisSchema>;

export type MonthlyAnalysisResult = {
  analysis: MonthlyAnalysis | null;
  usage: FlowUsage | null;
};

// ---------- Pure helpers ----------

// Structured outputs can't express an array maxItems, so the "TOP 3" cap is
// enforced here rather than in the schema.
export function capTopChanges(
  changes: MonthlyChange[],
  n = 3,
): MonthlyChange[] {
  return changes.slice(0, n);
}

// ---------- Prompts ----------

const PHASE1_SYSTEM = `你是訂閱管理顧問，任務是產生「本月分析」——一段對使用者本月訂閱花費的回顧，而不是聊天。
系統會先給你本月支出總覽、最近 6 個月趨勢、以及與上月的比較當起點。你的工作：
- 用 calculate_trend 看整體或單一服務的花費變化幅度。
- 用 detect_anomalies 找出本月的漲跌、可能重複或閒置的訂閱。
- 用 get_service_info 判斷某個服務的價格是否合理。
- 用 query_subscriptions 確認現況。
綜合寫出一段繁體中文回顧，聚焦三件事：本月最重要的幾個變動、一個使用者可能沒注意到的觀察、
以及具體可執行的建議。每個數字都要有幣別。只根據 tool 回傳的資料，缺資料就明說，不要編造數字。`;

const PHASE2_SYSTEM = `把下面這段本月分析整理成三個部分，依 schema 輸出。
- topChanges：本月最重要的變動，最多 3 個，依重要性排序。每個 summary 一行、要帶具體數字與幣別。
  本月沒有明顯變動就回傳空陣列。
- observation：一段自然語言的觀察敘事（完整句子，不是條列），點出使用者可能沒注意到的模式或趨勢。
- recommendations：1–2 個具體、可執行的建議（例如「取消閒置三個月的 X」），不要空泛。沒有值得建議的就回傳空陣列。
全部用繁體中文。`;

// ---------- Orchestrator ----------

export async function runMonthlyAnalysis(
  userId: string,
  model: LanguageModel = getModel(),
): Promise<MonthlyAnalysisResult> {
  const subs = await getActiveSubscriptions(userId);

  // Gate: a user with no active subscriptions has nothing to review — skip
  // both LLM phases entirely.
  if (subs.length === 0) {
    return { analysis: null, usage: null };
  }

  const trend = await getMonthlyTrend(userId, 6);
  const delta = computeMonthDelta(trend);
  const { totalMonthlyTwd } = computeOverview(
    subs.map((s) => ({ cycle: s.cycle, amountInTwd: s.amountInTwd })),
  );

  // Phase 1: agent investigates the monthly facts with tools, writes a
  // free-text review.
  const phase1 = await generateText({
    model,
    system: PHASE1_SYSTEM,
    prompt:
      `今天是 ${new Date().toISOString().slice(0, 10)}。\n` +
      `本月估算月支出：${totalMonthlyTwd} TWD（${subs.length} 個使用中訂閱）。\n` +
      `最近 6 個月趨勢（TWD）：${JSON.stringify(trend)}\n` +
      `與上月比較：${JSON.stringify(delta)}\n\n` +
      `請佐證後，寫出本月分析。`,
    tools: buildAgentTools(userId),
    stopWhen: stepCountIs(8),
  });

  // Phase 2: constrain the review into the three-part structure (proven
  // Gemini path).
  const phase2 = await generateObject({
    model,
    schema: MonthlyAnalysisSchema,
    system: PHASE2_SYSTEM,
    prompt: phase1.text,
    temperature: 0,
  });

  const analysis: MonthlyAnalysis = {
    ...phase2.object,
    topChanges: capTopChanges(phase2.object.topChanges),
  };
  const usage = buildFlowUsage(
    tokensOf(phase1.totalUsage),
    tokensOf(phase2.usage),
    buildStepBreakdown(phase1.steps),
  );

  return { analysis, usage };
}
