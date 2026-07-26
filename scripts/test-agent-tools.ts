import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { generateText, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { getModel } from "@/lib/llm";
// db (and everything that imports it) must be loaded AFTER dotenv config —
// static imports hoist above the config() calls and Prisma would capture an
// undefined DATABASE_URL. Type-only imports are erased, so they are safe.
import type { buildAgentTools } from "@/lib/agent/tools";

// Week 6 Day 5: CLI integration test for the first two agent tools against
// real DB data. Verifies tool choice, argument generation, and multi-step
// chaining before the Week 7 agent work. The per-step logging here is the
// seed of the Week 8 AgentTrace format.
//
// Run: npx tsx scripts/test-agent-tools.ts [--model=gemini-2.5-flash]

const QUESTIONS = [
  "我現在有哪些訂閱？每個月總共花多少錢？",
  "Netflix 最近有漲價嗎？現在的方案價格是多少？",
  "我訂的 Claude 划算嗎？跟官方定價比一下，有沒有更省的方式？",
  // Week 7 Day 3: calculate_trend + detect_anomalies
  "我最近半年每個月的訂閱花費怎麼變化？有變多嗎？",
  "有哪些訂閱是我該注意的？例如快扣款、漲價、或可能重複訂閱的？",
];

function parseModel(): ReturnType<typeof getModel> {
  const arg = process.argv.find((a) => a.startsWith("--model="));
  return arg ? google(arg.slice("--model=".length)) : getModel();
}

async function ask(tools: ReturnType<typeof buildAgentTools>, question: string) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`❓ ${question}`);

  const started = Date.now();
  const result = await generateText({
    model: parseModel(),
    system:
      "你是訂閱管理助理，根據使用者的實際訂閱資料與服務知識庫回答問題。" +
      `今天是 ${new Date().toISOString().slice(0, 10)}。` +
      "金額一律標明幣別。回答使用繁體中文，簡潔但要有具體數字。" +
      "只根據 tool 回傳的資料回答，缺資料就明說，不要編造價格。",
    prompt: question,
    tools,
    stopWhen: stepCountIs(6),
  });

  result.steps.forEach((step, i) => {
    for (const call of step.toolCalls) {
      console.log(`  [step ${i + 1}] → ${call.toolName}(${JSON.stringify(call.input)})`);
    }
    for (const res of step.toolResults) {
      const preview = JSON.stringify(res.output);
      console.log(`  [step ${i + 1}] ← ${preview.length > 200 ? preview.slice(0, 200) + "…" : preview}`);
    }
  });

  if (result.text.trim()) {
    console.log(`💬 ${result.text.trim()}`);
  } else {
    console.log(`⚠️ 空回答（finishReason: ${result.finishReason}）— fallback trigger`);
  }
  console.log(
    `   steps=${result.steps.length} tokens=${result.totalUsage.totalTokens} elapsed=${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}

async function main() {
  const { db } = await import("@/lib/db");
  const { buildAgentTools } = await import("@/lib/agent/tools");

  const user = await db.user.findFirst();
  if (!user) {
    console.error("DB 裡沒有 user，先跑一次 ingest");
    process.exit(1);
  }
  console.log(`user: ${user.email}`);

  const tools = buildAgentTools(user.id);
  for (const q of QUESTIONS) {
    await ask(tools, q);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
