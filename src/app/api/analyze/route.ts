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

// A two-phase agent run measured at ~36s against real data (7 tool calls in
// step 1, then the write-up), which is comfortably past Vercel's 10–15s
// default. 60 is the Hobby ceiling and well inside Pro's 300, so it holds on
// either plan; raise it only if phase 1 starts needing more steps.
//
// Without this the platform kills the function mid-stream: the SSE connection
// just ends with no `done` event, which reads as an analysis that spins
// forever rather than as a failure.
export const maxDuration = 60;

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
        message: err instanceof Error ? err.message : "Analysis failed",
      });
    }
  });
}
