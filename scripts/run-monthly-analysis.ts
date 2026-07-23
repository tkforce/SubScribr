import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

// db-dependent modules load AFTER dotenv (see test-agent-tools.ts note).

// Week 7 Day 5: smoke test for the 8b「本月分析」flow against real DB +
// Gemini. Verifies the two-phase pipeline (subscription gate → agent
// investigation → three-part structured narrative) and prints token usage.
//
// Run: npx tsx scripts/run-monthly-analysis.ts

async function main() {
  const { db } = await import("@/lib/db");
  const { runMonthlyAnalysis } = await import("@/lib/agent/monthly-analysis");

  const user = await db.user.findFirst();
  if (!user) {
    console.error("DB 裡沒有 user，先跑一次 ingest");
    process.exit(1);
  }
  console.log(`user: ${user.email}`);

  const started = Date.now();
  const { analysis, usage } = await runMonthlyAnalysis(user.id);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\n本月分析（${elapsed}s）`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (!analysis) {
    console.log("（沒有使用中的訂閱，無可分析）");
  } else {
    console.log("【本月主要變動】");
    if (analysis.topChanges.length === 0) console.log("  （本月無明顯變動）");
    for (const c of analysis.topChanges) {
      console.log(`  • ${c.summary}  [${c.serviceName}]`);
    }

    console.log("\n【AI 觀察】");
    console.log(`  ${analysis.observation}`);

    console.log("\n【建議】");
    if (analysis.recommendations.length === 0) console.log("  （無）");
    for (const r of analysis.recommendations) {
      console.log(`  • ${r}`);
    }
  }

  if (usage) {
    console.log(
      `\ntoken: phase1=${usage.phase1Tokens}（${usage.steps} steps）` +
        ` phase2=${usage.phase2Tokens} 合計=${usage.totalTokens}`,
    );
    usage.stepBreakdown.forEach((s, i) => {
      const tools = s.toolNames.length > 0 ? s.toolNames.join(", ") : "（無 tool call，寫最終文字）";
      console.log(`  [step ${i + 1}] ${tools}  — ${s.tokens} tokens`);
    });
  } else {
    console.log("\ntoken: 0（閘門擋下，未呼叫 LLM）");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
