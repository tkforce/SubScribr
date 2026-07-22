import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

// db-dependent modules load AFTER dotenv (see test-agent-tools.ts note).

// Week 7 Day 4: smoke test for the 8a「本週需要注意」flow against real DB +
// Gemini. Verifies the two-phase pipeline end to end: anomaly gate → agent
// investigation (phase 1) → structured cards (phase 2).
//
// Run: npx tsx scripts/run-alert-analysis.ts

const PRIORITY_ICON: Record<string, string> = {
  high: "🔴",
  medium: "🟡",
  low: "🟢",
};

const ACTION_LABEL: Record<string, string> = {
  keep: "保留",
  remind_later: "稍後提醒",
  go_cancel: "前往取消",
};

async function main() {
  const { db } = await import("@/lib/db");
  const { detectAnomalies } = await import("@/lib/queries/anomalies");
  const { runWeeklyAlertAnalysis } = await import("@/lib/agent/alert-analysis");

  const user = await db.user.findFirst();
  if (!user) {
    console.error("DB 裡沒有 user，先跑一次 ingest");
    process.exit(1);
  }
  console.log(`user: ${user.email}`);

  // Show the raw facts the gate sees, so you can tell an empty result apart
  // from a flow that silently did nothing.
  const report = await detectAnomalies(user.id);
  console.log("\n偵測到的異常事實：");
  console.log(JSON.stringify(report, null, 2));

  const started = Date.now();
  const { cards } = await runWeeklyAlertAnalysis(user.id);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\n本週需要注意（${cards.length} 張卡片，${elapsed}s）`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (cards.length === 0) {
    console.log("（沒有值得注意的事項）");
  }
  for (const c of cards) {
    console.log(`${PRIORITY_ICON[c.priority] ?? "•"} ${c.title}  [${c.serviceName}]`);
    console.log(`   ${c.detail}`);
    console.log(`   → 建議：${ACTION_LABEL[c.suggestedAction] ?? c.suggestedAction}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
