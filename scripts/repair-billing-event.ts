import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

// One-off: delete a corrupted BillingEvent and re-derive it from the (now
// fixed) production pipeline. Reuses processEmail() and
// upsertSubscriptionsForServices() verbatim — no reimplemented insert logic,
// so the repaired row is byte-for-byte what a fresh ingest would produce.
//
// Context: gmailMessageId 19f6f7244de2d6bd (a Claude Pro subscription-
// confirmed email with no price in the visible body) was mis-extracted as
// 96 USD/yearly because a stray "96" leaked out of an Outlook-only HTML
// comment (<!--[if mso]>...<o:PixelsPerInch>96</o:PixelsPerInch>...) that
// the old stripHtml() didn't recognize as a comment. Fixed in gmail.ts.
//
// Run: npx tsx scripts/repair-billing-event.ts <gmailMessageId>

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
  const gmailMessageId = process.argv[2];
  if (!gmailMessageId) {
    console.error("用法：npx tsx scripts/repair-billing-event.ts <gmailMessageId>");
    process.exit(1);
  }

  const { db } = await import("@/lib/db");
  const { decryptToken } = await import("@/lib/token-crypto");
  const { getMessage } = await import("@/lib/ingestion/gmail");
  const { processEmail } = await import("@/lib/ingestion/pipeline");
  const { upsertSubscriptionsForServices } = await import("@/lib/ingestion/derive");

  const user = await db.user.findFirst();
  if (!user?.gmailToken) {
    console.error("找不到 user 或 gmailToken");
    process.exit(1);
  }

  const existing = await db.billingEvent.findUnique({
    where: { gmailMessageId },
  });
  if (!existing) {
    console.error(`找不到 gmailMessageId=${gmailMessageId} 的 BillingEvent`);
    process.exit(1);
  }
  console.log("修復前：");
  console.log(
    `  ${existing.serviceName}  ${Number(existing.amount)} ${existing.currency}  ` +
      `${existing.cycle}  ${existing.emailSignalType}  (promptVersion=${existing.promptVersion})`,
  );

  const refreshToken = decryptToken(user.gmailToken);
  if (!refreshToken) {
    console.error("gmailToken 解密失敗");
    process.exit(1);
  }
  const accessToken = await refreshAccessToken(refreshToken);
  const email = await getMessage(accessToken, gmailMessageId);

  // Delete first: gmailMessageId is globally unique, so re-insert would
  // otherwise collide if the corrected extraction still produces a row.
  await db.billingEvent.delete({ where: { gmailMessageId } });
  console.log("已刪除舊事件");

  const outcome = await processEmail(email, user.id);
  console.log(`\n重新抽取結果：${outcome.kind}`);

  if (outcome.kind !== "inserted") {
    console.log(
      "沒有寫入新的 BillingEvent（正確行為：信中沒有可靠的金額，不該產生一筆數字捏造的事件）。",
    );
  } else {
    await db.billingEvent.create({ data: outcome.row });
    console.log(
      `已寫入修復後的事件：${outcome.row.serviceName}  ${outcome.row.amount} ${outcome.row.currency}  ` +
        `${outcome.row.cycle}  ${outcome.row.emailSignalType}  (promptVersion=${outcome.row.promptVersion})`,
    );
  }

  // Replay-from-scratch: re-derive this service's Subscription state from
  // its full (now-corrected) BillingEvent log, regardless of outcome —
  // deleting an event can change the derived state just as much as adding one.
  const upserted = await upsertSubscriptionsForServices(
    user.id,
    new Set([existing.serviceName]),
  );
  console.log(`\n已重新 derive ${upserted} 個 service 的 Subscription 狀態`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
