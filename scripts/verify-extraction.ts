import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

// One-off: verify whether a specific BillingEvent's amount was actually
// present in the source email or fabricated during extraction.
//
// Two-step verification, not a guess:
//   1. Re-fetch the raw email straight from Gmail by messageId (ground truth —
//      not memory, not a fixture that might be stale).
//   2. Re-run the real production llmExtract() on that exact email N times.
//      If it reproduces the same fabricated figure every time, that's a
//      systematic prompt-induced hallucination, not sampling noise. If it
//      varies run to run, the model has no real signal for this email and is
//      guessing — same verdict (don't trust the number), different mechanism.
//
// Run: npx tsx scripts/verify-extraction.ts <gmailMessageId>
//      npx tsx scripts/verify-extraction.ts --find=<serviceName>  (looks up
//        the newest BillingEvent for that service and verifies it)

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Gmail token refresh failed: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error(
      "用法：npx tsx scripts/verify-extraction.ts <gmailMessageId>\n" +
        "  或：npx tsx scripts/verify-extraction.ts --find=claude",
    );
    process.exit(1);
  }

  const { db } = await import("@/lib/db");
  const { decryptToken } = await import("@/lib/token-crypto");
  const { getMessage } = await import("@/lib/ingestion/gmail");
  const { llmExtract, PROMPT_VERSION } = await import("@/lib/ingestion/extraction");

  const user = await db.user.findFirst();
  if (!user) {
    console.error("DB 裡沒有 user");
    process.exit(1);
  }
  if (!user.gmailToken) {
    console.error("使用者沒有存 gmailToken，無法重新從 Gmail 撈信");
    process.exit(1);
  }

  let gmailMessageId: string;
  if (arg.startsWith("--find=")) {
    const serviceName = arg.slice("--find=".length);
    const event = await db.billingEvent.findFirst({
      where: { userId: user.id, serviceName },
      orderBy: { emailReceivedAt: "desc" },
    });
    if (!event) {
      console.error(`找不到 serviceName=${serviceName} 的 BillingEvent`);
      process.exit(1);
    }
    gmailMessageId = event.gmailMessageId;
    console.log(
      `找到最新事件：${event.emailReceivedAt.toISOString().slice(0, 10)}  ` +
        `${Number(event.amount)} ${event.currency}  ${event.cycle}  ${event.emailSignalType}  ` +
        `(extracted with ${event.promptVersion})`,
    );
  } else {
    gmailMessageId = arg;
  }

  const refreshToken = decryptToken(user.gmailToken);
  if (!refreshToken) {
    console.error("gmailToken 解密失敗（AUTH_SECRET 換過？使用者需要重新連接 Gmail）");
    process.exit(1);
  }

  console.log("\n重新換 access token 並直接向 Gmail 撈信…");
  const accessToken = await refreshAccessToken(refreshToken);
  const email = await getMessage(accessToken, gmailMessageId);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("原始信件（Gmail 權威來源，不是記憶或 fixture）");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`From: ${email.from}`);
  console.log(`Subject: ${email.subject}`);
  console.log(`Date: ${email.date}`);
  console.log(`\nBody:\n${email.body}`);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`用正式 llmExtract() 對這封信重跑 3 次（目前 prompt: ${PROMPT_VERSION}）`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (let i = 1; i <= 3; i++) {
    const result = await llmExtract(email);
    if (!result) {
      console.log(`[跑 ${i}] extraction 失敗（schema 驗證失敗或 API 錯誤）`);
      continue;
    }
    console.log(
      `[跑 ${i}] isSubscriptionRelated=${result.isSubscriptionRelated} ` +
        `amount=${result.amount ?? "—"} currency=${result.currency ?? "—"} ` +
        `cycle=${result.cycle ?? "—"} signal=${result.emailSignalType ?? "—"} ` +
        `raw="${result.rawServiceName ?? "—"}"`,
    );
  }

  console.log(
    "\n判讀：3 次都吐出同一個金額 → prompt 誘導出的系統性幻覺（同一輸入穩定產生錯誤輸出）。\n" +
      "      3 次金額不一致 → 這封信本來就沒有可靠訊號，model 在瞎猜。\n" +
      "      3 次都沒有 amount（或 isSubscriptionRelated=false）→ 原本那筆可能是舊 prompt 版本的問題，現在已經修好。",
  );

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
