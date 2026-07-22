import type { SubscriptionEmail } from "@/lib/ingestion/gmail";

const SUBJECT_BLACKLIST = [
  /password reset/i,
  /verify your (email|account)/i,
  /confirm your email/i,
  /sign[- ]?in (code|link|attempt)/i,
  /two[- ]?factor/i,
  /calendar invite/i,
  /meeting invitation/i,
  /unsubscribe/i,
  /welcome to/i,
  /歡迎/,
  /驗證/,
  /重設密碼/,
];

const SENDER_DOMAIN_BLACKLIST = [
  "calendar.google.com",
  "noreply@accounts.google.com",
];

export function isBlacklisted(email: SubscriptionEmail): boolean {
  if (SUBJECT_BLACKLIST.some((re) => re.test(email.subject))) return true;
  const from = email.from.toLowerCase();
  if (SENDER_DOMAIN_BLACKLIST.some((d) => from.includes(d))) return true;
  return false;
}
