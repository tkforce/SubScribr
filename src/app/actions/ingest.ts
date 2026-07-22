"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ingestEmails, type IngestStats } from "@/lib/ingestion/pipeline";
import { shouldRunIngest } from "@/lib/ingest-freshness";
import { INGEST_WINDOW_DAYS } from "@/lib/constants";

export type IngestResult =
  | { skipped: true }
  | { skipped: false; stats: IngestStats };

export async function ingestSubscriptionEmails(
  options: { force?: boolean } = {},
): Promise<IngestResult> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthenticated");
  if (session.error === "RefreshAccessTokenError") {
    throw new Error("Gmail connection expired — please reconnect Gmail.");
  }
  if (!session.access_token)
    throw new Error("No Gmail access token available.");
  if (!session.userId)
    throw new Error("No DB user id on session — sign out and sign in again.");

  // Freshness is re-checked server-side (not only in the AutoSync client) so
  // multiple tabs or rapid navigations can't stack redundant ingests.
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { lastIngestAt: true },
  });
  if (
    !shouldRunIngest(options?.force ?? false, user?.lastIngestAt ?? null, new Date())
  ) {
    return { skipped: true };
  }

  const stats = await ingestEmails(
    session.access_token,
    session.userId,
    INGEST_WINDOW_DAYS,
  );
  return { skipped: false, stats };
}
