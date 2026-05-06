"use server";

import { auth } from "@/auth";
import { fetchSubscriptionEmails, type SubscriptionEmail } from "@/lib/gmail";

export async function getSubscriptionEmails(): Promise<SubscriptionEmail[]> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthenticated");
  if (session.error === "RefreshAccessTokenError") {
    throw new Error("Gmail connection expired — please sign in again.");
  }
  if (!session.access_token)
    throw new Error("No Gmail access token available.");
  return fetchSubscriptionEmails(session.access_token);
}
