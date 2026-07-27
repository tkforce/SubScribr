import { auth } from "@/auth";
import { createSseResponse } from "@/lib/sse";
import {
  runAnalysis,
  ANALYSIS_PROMPT_VERSION,
  type AnalysisEvent,
} from "@/lib/agent/analysis";
import {
  getAnalysisState,
  saveAnalysis,
  saveAgentTrace,
} from "@/lib/queries/analysis";

// The AI dashboard section's streaming endpoint: progress events while the
// agent works, then a final `done` event carrying the structured analysis.
//
// userId always comes from the session, never from the request body — this
// is a per-user analysis, and trusting a client-supplied id would let any
// signed-in user request another user's subscription data.
export async function POST() {
  const session = await auth();
  if (!session?.userId) {
    return new Response("Unauthenticated", { status: 401 });
  }
  const userId = session.userId;

  return createSseResponse<AnalysisEvent>(async (send) => {
    try {
      const { lastIngestAt, stored, stale } = await getAnalysisState(userId);

      // Freshness is re-checked server-side (not only in the client) so that
      // multiple tabs or rapid navigations can't stack redundant agent runs.
      if (!stale && stored) {
        send({ type: "done", analysis: stored.analysis, usage: null });
        return;
      }

      // Captured before the run, not after: if an ingest lands while the agent
      // is working, this analysis is based on the older log and must be marked
      // stale so the next visit regenerates it. Stamping the post-run value
      // would falsely present it as current.
      const basedOnIngestAt = lastIngestAt;

      const { analysis, usage } = await runAnalysis(userId, undefined, send);

      // A null analysis means the subscription gate skipped both LLM phases —
      // nothing worth persisting, and re-running costs nothing.
      if (analysis && basedOnIngestAt) {
        await saveAnalysis(
          userId,
          analysis,
          basedOnIngestAt,
          ANALYSIS_PROMPT_VERSION,
        );
      }
      await saveAgentTrace(userId, usage, "success");
    } catch (err) {
      // Logged with the full object, not just the message: the SDK's errors
      // carry a `cause` chain that the user-facing string throws away.
      console.error("[analysis] run failed:", err);
      await saveAgentTrace(userId, null, "failed").catch(() => {});
      send({
        type: "error",
        message: err instanceof Error ? err.message : "分析失敗",
      });
    }
  });
}
