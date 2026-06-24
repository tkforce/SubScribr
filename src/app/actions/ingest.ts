"use server";

import { auth } from "@/auth";
import { ingestEmails, type IngestStats } from "@/lib/ingestion";
import { INGEST_WINDOW_DAYS } from "@/lib/constants";

export async function ingestSubscriptionEmails(): Promise<IngestStats> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthenticated");
  if (session.error === "RefreshAccessTokenError") {
    throw new Error("Gmail connection expired — please sign in again.");
  }
  if (!session.access_token)
    throw new Error("No Gmail access token available.");
  if (!session.userId)
    throw new Error("No DB user id on session — sign out and sign in again.");

  return ingestEmails(session.access_token, session.userId, INGEST_WINDOW_DAYS);
}
