import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

// One-off: dump the raw BillingEvents for a service, to check whether a figure
// the agent reported is real or hallucinated. No LLM, no cost.
//
// Run: npx tsx scripts/inspect-events.ts [serviceName]   (default: claude)

async function main() {
  const { db } = await import("@/lib/db");
  const service = process.argv[2] ?? "claude";

  const user = await db.user.findFirst();
  if (!user) {
    console.error("DB 裡沒有 user");
    process.exit(1);
  }

  const rows = await db.billingEvent.findMany({
    where: { userId: user.id, serviceName: service },
    orderBy: { emailReceivedAt: "asc" },
    select: {
      emailReceivedAt: true,
      amount: true,
      currency: true,
      amountInTwd: true,
      cycle: true,
      emailSignalType: true,
      rawServiceName: true,
    },
  });

  console.log(`${service}: ${rows.length} 筆 billing events`);
  for (const r of rows) {
    console.log(
      `${r.emailReceivedAt.toISOString().slice(0, 10)}  ` +
        `${Number(r.amount)} ${r.currency} (${Number(r.amountInTwd)} TWD)  ` +
        `${r.cycle}  ${r.emailSignalType}  [${r.rawServiceName}]`,
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
