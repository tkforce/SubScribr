import { db } from "@/lib/db";
import {
  AnalysisSchema,
  ANALYSIS_PROMPT_VERSION,
  type Analysis,
} from "@/lib/agent/analysis";
import type { FlowUsage } from "@/lib/agent/usage";

// Persistence for the AI dashboard section's result.
//
// The analysis is a derived view of the BillingEvent log, so it has no
// independent lifecycle: one version per ingest, replaced whole. There is no
// time-based expiry — the ingest freshness gate (AUTO_SYNC_THRESHOLD_HOURS)
// already guarantees a sync at least twice a day, which doubles as the bound
// on how stale a date-relative claim ("3 天後扣款") can get.

// ---------- Pure ----------

// Stale when the event log moved on since this analysis was derived from it,
// or when it was produced by a prompt/schema generation we no longer serve.
//
// The version check is load-bearing, not belt-and-braces: Zod strips unknown
// keys instead of rejecting, so a payload from an older schema still parses
// successfully — it just silently loses whatever fields that version had.
// Without the stamp, an outdated analysis would be served as current forever.
//
// A user who has never ingested has no events, so any stored analysis is
// meaningless and counts as stale.
export function isAnalysisStale(
  stored: { basedOnIngestAt: Date; promptVersion: string } | null,
  lastIngestAt: Date | null,
  currentPromptVersion: string,
): boolean {
  if (lastIngestAt === null) return true;
  if (stored === null) return true;
  if (stored.promptVersion !== currentPromptVersion) return true;
  return stored.basedOnIngestAt < lastIngestAt;
}

// Prisma types Json as unknown, so the stored payload is validated on read.
// Returning null on a mismatch makes schema changes self-healing: old rows
// become "no analysis" and the next ingest regenerates them, instead of
// needing a migration script for content.
export function parseAnalysisPayload(payload: unknown): Analysis | null {
  const parsed = AnalysisSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

// ---------- I/O ----------

export type StoredAnalysis = {
  analysis: Analysis;
  generatedAt: Date;
};

// Reads the user's last-ingest time together with their stored analysis, so
// the caller can decide freshness from a single query.
export async function getAnalysisState(userId: string): Promise<{
  lastIngestAt: Date | null;
  stored: StoredAnalysis | null;
  stale: boolean;
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { lastIngestAt: true, analysis: true },
  });

  const lastIngestAt = user?.lastIngestAt ?? null;
  const row = user?.analysis ?? null;
  const analysis = row ? parseAnalysisPayload(row.payload) : null;

  const stale =
    analysis === null ||
    isAnalysisStale(
      { basedOnIngestAt: row!.basedOnIngestAt, promptVersion: row!.promptVersion },
      lastIngestAt,
      ANALYSIS_PROMPT_VERSION,
    );

  // Two kinds of stale, and only one of them is still displayable.
  // Data-stale (the log moved on) keeps rendering while a fresh run streams —
  // that is the point of stale-while-revalidate. Version-stale is a payload
  // from an older schema: it parses, but silently lost fields the current UI
  // renders, so showing it would present an incomplete analysis as current.
  const versionStale =
    row !== null && row.promptVersion !== ANALYSIS_PROMPT_VERSION;

  return {
    lastIngestAt,
    stored:
      analysis && !versionStale
        ? { analysis, generatedAt: row!.generatedAt }
        : null,
    stale,
  };
}

export async function saveAnalysis(
  userId: string,
  analysis: Analysis,
  basedOnIngestAt: Date,
  promptVersion: string,
): Promise<void> {
  // generatedAt must be set explicitly on update — @default(now()) only fires
  // on create, so omitting it would freeze the "分析於 X 前" label forever.
  const data = {
    payload: analysis,
    basedOnIngestAt,
    promptVersion,
    generatedAt: new Date(),
  };
  await db.analysis.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

// Observability counterpart to saveAnalysis: the result goes in Analysis, how
// it was produced goes here.
export async function saveAgentTrace(
  userId: string,
  usage: FlowUsage | null,
  status: "success" | "failed",
): Promise<void> {
  await db.agentTrace.create({
    data: {
      userId,
      section: "analysis",
      steps: usage?.stepBreakdown ?? [],
      totalTokens: usage?.totalTokens ?? 0,
      // Cost needs per-model pricing we don't track yet; the token counts are
      // the useful signal for now.
      totalCostUsd: 0,
      status,
    },
  });
}
