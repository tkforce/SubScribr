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

// The single AI dashboard section, merged from what the plan had as two: 8a
// "this week needs attention" and 8b "this month's analysis".
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
  // alert = needs attention / change = changed this month / observation =
  // a pattern across services
  kind: z.enum(["alert", "change", "observation"]),
  // 🔴 high / 🟡 medium / 🟢 low
  priority: z.enum(["high", "medium", "low"]),
  serviceName: z.string(),
  title: z.string(), // one sentence, e.g. "Netflix is NT$60 more expensive"
  detail: z.string(), // the specifics, with numbers and a currency
  // One sentence of advice, sitting next to the fact it is about. Items that
  // only state a fact do without it.
  suggestion: z.string().optional(),
});

// Just a headline and a list. An earlier version also had `observation` and
// `recommendations` as separate prose blocks, but they restated the cards:
// recommendations were per-item advice, which is the same axis the cards
// already cover. Cross-cutting patterns (the one thing prose could say that a
// card couldn't) are now kind:"observation" cards, and per-item advice moved
// into each card's own `suggestion`, next to the fact it is about.
export const AnalysisSchema = z.object({
  headline: z.string(), // one-sentence TL;DR at the top of the section
  insights: z.array(InsightSchema), // sorted and capped at 5 in code
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
export const ANALYSIS_PROMPT_VERSION = "v3-cards-only-english";

const PHASE1_SYSTEM = `You are a subscription advisor. Your job is to write the user a review of what they need to know about their subscriptions right now — not to chat.
You are handed three things to start from: the anomaly scan's findings (JSON), the last 6 months of spend, and the comparison against last month.
Look at "what needs attention" and "what changed this month" together, and write one complete review:
- Use get_service_info for a service's public pricing and price history, to judge whether an amount is reasonable and whether an increase is significant.
- Use calculate_trend for how overall or per-service spend has moved.
- Use detect_anomalies to fill in duplicates, idle services, price changes, upcoming renewals.
- Use query_subscriptions to confirm what the user is subscribed to right now.
- Decide which facts are actually worth saying (two video subscriptions in one
  category is not necessarily a problem; a service with no charge for three
  months that still shows active may have been cancelled elsewhere, and that is
  worth flagging).

When judging:
- A price increase is the warning signal. A decrease is usually good news or
  neutral — do not treat it as something needing attention unless it implies a
  plan downgrade the user did not know about.
- Services whose bills naturally fluctuate (telecom, utilities, anything
  metered or paid in instalments) move around all the time; a changing amount
  is not by itself a problem.
- For a service get_service_info cannot find (found:false, e.g. a local
  telecom), you have no pricing knowledge. Do not speculate that an amount is
  "abnormal" or "unreasonable" — state the fact and mark it as something the
  user should confirm themselves.
- Say each thing once. A price increase is both "needs attention" and "changed
  this month"; pick one angle and make it well.
- When you say "cancelling X saves N", N can only be X's own monthly fee. The
  combined total of several services in one category **is not a saving** —
  cancelling one of them saves that one's fee, not all of them. A combined
  total may only be used to describe what the category costs in total.
- Several services in one category is not proof of waste. Two telecom lines may
  be family numbers; two cloud plans may serve different purposes. You cannot
  tell from a bill which one should go, so prompt the user to check — never
  conclude it is duplicate spending.

Tool efficiency: **gather everything you need in as few rounds as possible.**
To look up four services' pricing, issue four get_service_info calls in the same
round; do not finish one before starting the next. Every extra round re-sends
the whole conversation, so cost compounds. You get at most 8 rounds — spending
them all means being cut off before you write the conclusion.

Write the review in English, covering two things: the specific items worth
noting or that changed this month (each with what you suggest the user do, or
weigh), and one cross-service pattern they may not have noticed (a category's
share rising, say). Every item needs concrete numbers and a currency.
Every number must come from a tool result. If a tool did not give you an amount,
a date, or a plan name, do not write it — never invent or estimate one.`;

const PHASE2_SYSTEM = `Turn the subscription review below into structured output, following the schema.

headline: one sentence summarising the month, with concrete numbers (e.g. "Spend
is up NT$106 this month, mostly Cursor's price increase; 2 things need
attention"). It is the one line the user is guaranteed to read.
**If your headline says "N things need attention", N must equal the number of
insights you actually output.** If you are not sure, leave the number out and
describe it instead ("spend is slightly up").

insights: this list is the entire section — everything goes in it. One item per
specific thing; do not pack several things into one. Never say the same thing
twice. At most 5 items, of which at most 1 is an observation.
- kind:
  - alert: money may be leaking, or a state is wrong and needs the user to
    confirm it.
  - change: a factual statement of what was added, cancelled, or repriced this
    month.
  - observation: **a pattern across services or across time** — e.g. "AI
    subscriptions went from 1 to 3 in three months and are now 52% of monthly
    spend". This one has to be about what several services add up to; it cannot
    be an alert reworded. If there is no such pattern, do not force one.
- priority:
  - high: reserved for money that is being or is about to be lost and needs a
    decision soon (a significant increase, charges continuing on something that
    looks cancelled, an idle service about to bill). If you are not sure, it is
    not high.
  - medium: worth a look but not urgent, or genuinely uncertain (possibly
    duplicate subscriptions, a small increase, a fluctuation the user has to
    judge).
  - low: purely informational (an ordinary upcoming renewal, a plain statement
    of an amount changing).
  - **Several services in one category (possible duplicates) belong in the list
    as one insight, at medium.** Never high: you cannot tell from a bill whether
    that is waste or two different purposes (family phone lines, cloud storage
    for different things), and something inherently uncertain should not use the
    top priority to push the user.
- A price decrease is not a warning: a service getting cheaper is good or
  neutral, at most low, and never a reason to suggest cancelling.
- For services whose bills naturally fluctuate (telecom, utilities and other
  metered or instalment billing), do not tell the user to cancel just because
  the amount moved; use medium and let them look.
- title is one sentence; detail carries the concrete numbers and currency.
- If there is genuinely nothing worth saying, return an empty array.

suggestion (one sentence, sitting inside that card; items that only state a fact
can omit it):
- Concrete enough that the user knows what to do next or what to weigh. Good:
  "Check whether you really need both Chunghwa Telecom and FarEasTone."
  "Confirm on Netflix's site that this subscription is actually cancelled, so
  you stop being charged."
- **Never mention a feature this product does not have.** There are no
  reminders, no scheduling, no cancelling on the user's behalf, no one-click
  unsubscribe — so never write "we will remind you later" or "we will notify you
  before the charge". You can only suggest what the user does or checks
  themselves.
- Do not write "keep it" or "look at it later"; that says nothing. If you have
  no concrete suggestion, omit suggestion.
- When mentioning a possible saving, only ever the service's own monthly fee.
  **The combined total of same-category services is not a saving** — "cancel one
  of the two telecoms to save the combined 841 TWD" is wrong; cancelling one
  saves only that one.

Write everything in English.`;

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

  onEvent?.({ type: "progress", message: "Reading your subscriptions…" });

  const [report, trend] = await Promise.all([
    detectAnomalies(userId),
    getMonthlyTrend(userId, 6),
  ]);
  const delta = computeMonthDelta(trend);
  const { totalMonthlyTwd } = computeOverview(
    subs.map((s) => ({ cycle: s.cycle, amountInTwd: s.amountInTwd })),
  );

  onEvent?.({ type: "progress", message: "Analyzing your subscriptions…" });

  // Phase 1: one agent investigation over both the anomaly facts and the
  // monthly trend. streamText (not generateText) so fullStream's
  // tool-call/tool-result chunks can be surfaced as progress events.
  const phase1 = streamText({
    model,
    system: PHASE1_SYSTEM,
    prompt:
      `Today is ${new Date().toISOString().slice(0, 10)}.\n` +
      `Estimated spend this month: ${totalMonthlyTwd} TWD across ${subs.length} active subscriptions.\n` +
      `Anomaly scan findings (JSON):\n${JSON.stringify(report)}\n` +
      `Last 6 months of spend (TWD): ${JSON.stringify(trend)}\n` +
      `Versus last month: ${JSON.stringify(delta)}\n\n` +
      `Corroborate with the tools, then write the review.`,
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
  if (fatal) throw new Error(`Analysis stopped: ${fatal}`);

  onEvent?.({ type: "progress", message: "Shaping the result…" });

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
