import { z } from "zod";
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import type { SubscriptionEmail } from "@/lib/gmail";
import { getModel } from "@/lib/llm";

export const ExtractionSchema = z.object({
  isSubscriptionRelated: z.boolean(),
  notSubscriptionReason: z
    .enum(["one_time_purchase", "promotional", "service_unrelated", "unclear"])
    .optional(),
  rawServiceName: z.string().optional(),
  amount: z.number().positive().optional(),
  currency: z.enum(["TWD", "USD", "JPY", "EUR"]).optional(),
  cycle: z.enum(["monthly", "yearly", "quarterly", "one-time"]).optional(),
  nextBillingDate: z.iso.date().optional(),
  category: z
    .enum(["entertainment", "productivity", "ai", "cloud", "comm", "other"])
    .optional(),
  emailSignalType: z
    .enum([
      "billing",
      "trial_reminder",
      "we_miss_you",
      "price_change",
      "renewal_notice",
      "cancellation",
    ])
    .optional(),
  isTrial: z.boolean().optional(),
  trialEndsAt: z.iso.date().optional(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export const PROMPT_VERSION = "v4-currency-rules-temp0";

export const SYSTEM_PROMPT = `你是訂閱信件分析師。從 email 中抽取訂閱資訊，依下方 JSON schema 回應。

判斷 isSubscriptionRelated 的規則：
- 是訂閱：定期扣款、月/年費、會員續訂、試用期提醒、訂閱取消通知。
  電信月租帳單（如手機門號月費）也算訂閱。
- 不是訂閱（false）：
  - 單次購買（Uber Eats 訂單、電商發票、餐廳消費）→ one_time_purchase
  - 儲值點數/預付卡/票券購買（健身房點數卡、分鐘計費卡等）：即使標示
    「方案時長」或使用期限（如一年內有效），那是點數的有效期限，不是
    定期扣款週期 → one_time_purchase
  - 行銷信、優惠券、推播 → promotional
  - 信用卡/銀行月結帳單繳款通知：那是多筆消費的彙總，不是單一服務的
    訂閱費 → service_unrelated
  - 定期定額投資扣款（證券、基金、買股圈存）：雖然每月定期，但投資
    不是服務訂閱 → service_unrelated
  - 帳務行政通知（發票寄送地址變更、帳單格式異動等），信中沒有實際
    扣款事件 → service_unrelated
  - 電子發票開立通知、密碼重設、登入提醒 → service_unrelated
  - 模糊無法判斷 → unclear

抽欄位規則：
- amount: 純數字，不含貨幣符號。多個金額時取「實際扣款總額」
- currency: 依信件實際線索判斷，不要一律預設台幣。判斷優先序：
  1. 明確貨幣標記最優先：NT$ / 新台幣 / 「元」→ TWD；US$ / USD → USD；
     ¥ / 円 / JPY → JPY；€ / EUR → EUR
  2. 只有裸 "$" 無其他標記時，看服務與寄件者來源：國外服務官方或 Stripe
     收據（如 anthropic.com、openai.com）→ USD；Apple / Google / 本地電信
     帳單若內文同時出現 NT$ → TWD
  3. 仍無法判斷時才用金額量級輔助（月費 $20 多為 USD、$690 多為 TWD）
- rawServiceName: 服務的「品牌名」，不是公司全名（例如 "Netflix" 而非 "Netflix International B.V."）
- emailSignalType:
  - billing: 已扣款通知 / 收據
  - renewal_notice: 即將續訂提醒（還沒扣）
  - trial_reminder: 試用期將結束
  - price_change: 漲價/降價公告
  - cancellation: 取消確認
  - we_miss_you: 回流促銷信（已停訂閱）
- nextBillingDate: ISO 格式 (YYYY-MM-DD)

isSubscriptionRelated=false 時，只填 notSubscriptionReason，其他欄位省略。

判斷範例（以下都「不是」訂閱）：

範例 1：
Subject: 信用卡帳單繳款通知
重點：信用卡月結帳單是多筆消費的彙總，金額每月浮動，不是某個服務的訂閱費
→ isSubscriptionRelated: false, notSubscriptionReason: service_unrelated

範例 2：
Subject: 台股定期定額買股預先圈存(或預收)款項通知書
重點：定期定額投資扣款，雖然每月定期但是投資行為，不是服務訂閱
→ isSubscriptionRelated: false, notSubscriptionReason: service_unrelated

範例 3：
Subject: Important – AWS Invoice e-mail address changes
重點：帳務行政通知（設定變更），信中沒有任何實際扣款事件
→ isSubscriptionRelated: false, notSubscriptionReason: service_unrelated

範例 4：
Subject: 購買成功通知 | More Fit
重點：購買健身房儲值點數（分鐘計費卡）。「方案時長 1年」是點數使用期限，
不是定期扣款週期；即使商家是訂閱制常見的行業，單次購買就不是訂閱
→ isSubscriptionRelated: false, notSubscriptionReason: one_time_purchase

幣別判斷範例：

範例 5：
From: invoice+statements@mail.anthropic.com，內文 "Claude Pro $20.00 Paid"
重點：Anthropic 是美國服務、Stripe 收據，裸 "$" 視為美金，不是台幣
→ currency: USD

範例 6：
From: Apple，內文同時出現 "NT$ 690" 與 "$690/月"
重點：有明確 NT$ 標記，以明確標記為準
→ currency: TWD`;

export function formatUserPrompt(email: SubscriptionEmail): string {
  return `From: ${email.from}
Subject: ${email.subject}
Body:
${email.body}`;
}

function logExtractionFailure(gmailMessageId: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "Unknown";
  const message = err instanceof Error ? err.message : String(err);
  const kind =
    name.includes("Validation") || name.includes("NoObject")
      ? "schema_fail"
      : "api_error";
  console.warn(
    `[extraction:${kind}] gmailMessageId=${gmailMessageId} ${message}`,
  );
}

// Returns the parsed extraction, or null on any failure (skip + log, no retry).
// The caller decides what to do with isSubscriptionRelated=false.
export async function llmExtract(
  email: SubscriptionEmail,
  model: LanguageModel = getModel(),
): Promise<Extraction | null> {
  try {
    const { object } = await generateObject({
      model,
      schema: ExtractionSchema,
      system: SYSTEM_PROMPT,
      prompt: formatUserPrompt(email),
      // Extraction wants reproducibility, not creativity: same email → same
      // output, so eval scores are stable and currency doesn't flap run-to-run.
      temperature: 0,
    });
    return object;
  } catch (err) {
    logExtractionFailure(email.id, err);
    return null;
  }
}
