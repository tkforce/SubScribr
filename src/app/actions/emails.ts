"use server";

import { auth } from "@/auth";
import { fetchSubscriptionEmails, type SubscriptionEmail } from "@/lib/ingestion/gmail";
import { INGEST_WINDOW_DAYS } from "@/lib/constants";

export async function getSubscriptionEmails(): Promise<SubscriptionEmail[]> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthenticated");
  if (session.error === "RefreshAccessTokenError") {
    throw new Error("Gmail connection expired — please reconnect Gmail.");
  }
  if (!session.access_token)
    throw new Error("No Gmail access token available.");
  return fetchSubscriptionEmails(session.access_token, INGEST_WINDOW_DAYS);
}
