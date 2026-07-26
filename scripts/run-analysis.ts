import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

// db-dependent modules load AFTER dotenv (see test-agent-tools.ts note).

// Smoke test for the merged AI analysis flow against real DB + Gemini.
// Verifies the two-phase pipeline end to end: subscription gate → agent
// investigation over anomalies + trend (phase 1) → structured output (phase 2).
//
// Replaces the separate run-alert-analysis.ts / run-monthly-analysis.ts, which
// investigated the same data twice and reported it in two overlapping shapes.
//
// Run: npx tsx scripts/run-analysis.ts

const PRIORITY_ICON: Record<string, string> = {
  high: "🔴",
  medium: "🟡",
  low: "🟢",
};

const KIND_LABEL: Record<string, string> = {
  alert: "需要注意",
  change: "本月變動",
  observation: "觀察",
};

async function main() {
  const { db } = await import("@/lib/db");
  const { runAnalysis } = await import("@/lib/agent/analysis");

  const user = await db.user.findFirst();
  if (!user) {
    console.error("DB 裡沒有 user，先跑一次 ingest");
    process.exit(1);
  }
  console.log(`user: ${user.email}`);

  const started = Date.now();
  const { analysis, usage } = await runAnalysis(user.id);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\n訂閱分析（${elapsed}s）`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (!analysis) {
    console.log("（沒有使用中的訂閱，未呼叫 LLM）");
  } else {
    console.log(`\n${analysis.headline}\n`);

    if (analysis.insights.length === 0) {
      console.log("（沒有值得注意的項目）");
    }
    for (const i of analysis.insights) {
      console.log(
        `${PRIORITY_ICON[i.priority] ?? "•"} [${KIND_LABEL[i.kind] ?? i.kind}] ${i.title}  (${i.serviceName})`,
      );
      console.log(`   ${i.detail}`);
      if (i.suggestion) console.log(`   → ${i.suggestion}`);
    }
  }

  if (usage) {
    console.log(
      `\ntoken: phase1=${usage.phase1Tokens}（${usage.steps} steps）` +
        ` phase2=${usage.phase2Tokens} 合計=${usage.totalTokens}`,
    );
    usage.stepBreakdown.forEach((s, i) => {
      const tools =
        s.toolNames.length > 0
          ? s.toolNames.join(", ")
          : "（無 tool call，寫最終文字）";
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
