const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const BODY_CHAR_LIMIT = 8000;
const BATCH_SIZE = 20;

export type SubscriptionEmail = {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
};

export class GmailAuthError extends Error {
  constructor(message = "Gmail API unauthorized") {
    super(message);
    this.name = "GmailAuthError";
  }
}

export function buildSubscriptionQuery(days = 60): string {
  const englishKeywords = [
    "subscription",
    "renewal",
    "receipt",
    "invoice",
    "billing",
    "payment",
  ];
  const chineseKeywords = ["收據", "發票", "帳單"];
  const subjectKeywords = [...englishKeywords, ...chineseKeywords].join(" OR ");
  return `newer_than:${days}d (category:purchases OR subject:(${subjectKeywords}))`;
}

type ListResponse = {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
};

export async function listMessageIds(
  accessToken: string,
  query: string,
  max = 500,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < max) {
    const url = new URL(`${GMAIL_BASE}/messages`);
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", String(Math.min(100, max - ids.length)));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401) throw new GmailAuthError();
    if (!res.ok) {
      throw new Error(
        `Gmail messages.list failed: ${res.status} ${await res.text()}`,
      );
    }

    const data = (await res.json()) as ListResponse;
    if (data.messages) {
      for (const m of data.messages) ids.push(m.id);
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return ids.slice(0, max);
}

type GmailHeader = { name: string; value: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  snippet?: string;
  payload?: GmailPart;
};

export async function getMessage(
  accessToken: string,
  id: string,
): Promise<SubscriptionEmail> {
  const url = new URL(`${GMAIL_BASE}/messages/${id}`);
  url.searchParams.set("format", "full");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) throw new GmailAuthError();
  if (!res.ok) {
    throw new Error(
      `Gmail messages.get failed: ${res.status} ${await res.text()}`,
    );
  }

  const msg = (await res.json()) as GmailMessage;
  const headers = msg.payload?.headers ?? [];
  const headerValue = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    "";

  const body = normalizeText(extractBody(msg.payload));

  return {
    id: msg.id,
    from: normalizeText(headerValue("From")),
    subject: normalizeText(headerValue("Subject")),
    date: headerValue("Date"),
    snippet: normalizeText(msg.snippet ?? ""),
    body: body.slice(0, BODY_CHAR_LIMIT),
  };
}

// Strip noise that's pure overhead for an LLM, while preserving paragraph
// structure (single \n is signal in receipts — line items, amounts, dates).
function normalizeText(s: string): string {
  if (!s) return "";
  return s
    // CRLF / CR → LF
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Quoted-printable soft line breaks left over after decode
    .replace(/=\n/g, "")
    // Zero-width spaces / joiners / LRM/RLM (U+200B–U+200F)
    .replace(/[​-‏]/g, "")
    // Bidi embedding/override marks (U+202A–U+202E)
    .replace(/[‪-‮]/g, "")
    // Word joiner / invisible separators / bidi isolates (U+2060–U+2069)
    .replace(/[⁠-⁩]/g, "")
    // Soft hyphen (U+00AD) and BOM / zero-width no-break (U+FEFF)
    .replace(/[­﻿]/g, "")
    // Tabs, form feeds, vertical tabs → single space
    .replace(/[\t\f\v]+/g, " ")
    // Non-breaking space (U+00A0) → regular space
    .replace(/ /g, " ")
    // Strip trailing/leading spaces on every line
    .replace(/[ ]+\n/g, "\n")
    .replace(/\n[ ]+/g, "\n")
    // Collapse 3+ blank lines into one blank line
    .replace(/\n{3,}/g, "\n\n")
    // Collapse runs of regular spaces
    .replace(/ {2,}/g, " ")
    .trim();
}

function extractBody(payload: GmailPart | undefined): string {
  if (!payload) return "";
  const plain = findPart(payload, "text/plain");
  if (plain?.body?.data) return decodeBase64Url(plain.body.data);
  const html = findPart(payload, "text/html");
  if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data));
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return "";
}

function findPart(part: GmailPart, mimeType: string): GmailPart | undefined {
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return undefined;
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchMessagesByIds(
  accessToken: string,
  ids: string[],
): Promise<SubscriptionEmail[]> {
  const results: SubscriptionEmail[] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((id) => getMessage(accessToken, id)),
    );
    results.push(...batchResults);
  }
  return results;
}

export async function fetchSubscriptionEmails(
  accessToken: string,
): Promise<SubscriptionEmail[]> {
  const query = buildSubscriptionQuery(60);
  const ids = await listMessageIds(accessToken, query);
  return fetchMessagesByIds(accessToken, ids);
}
