import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createSseResponse } from "@/lib/sse";
import { ingestEmails, type IngestStats } from "@/lib/ingestion/pipeline";
import { shouldRunIngest } from "@/lib/ingest-freshness";
import { INGEST_WINDOW_DAYS } from "@/lib/constants";

// A first sync over a 90-day window measures ~56s against a real mailbox:
// hundreds of candidate emails, one LLM call each at pMap concurrency 20.
// That is already uncomfortably close to this ceiling — see the deployment
// risk noted in docs/superpowers/specs/2026-07-29-first-run-and-ingest-progress-design.md.
//
// Without this the platform kills the function mid-stream and the SSE
// connection just ends with no `done` event; consumeEventStream turns that
// into a reported failure rather than an endless spinner.
export const maxDuration = 60;

type IngestEvent =
  | { type: "progress"; message: string }
  | { type: "done"; stats: IngestStats | null }
  | { type: "error"; message: string };

// The sole ingestion entry point: progress events while the pipeline works,
// then a final `done` carrying the run's counters so the client can say what
// actually happened instead of rendering an unexplained empty dashboard.
//
// userId always comes from the session, never from the request body — a
// client-supplied id would let any signed-in user ingest into another account.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthenticated", { status: 401 });
  if (session.error === "RefreshAccessTokenError") {
    return new Response("Gmail connection expired", { status: 401 });
  }
  if (!session.access_token) {
    return new Response("No Gmail access token", { status: 401 });
  }
  if (!session.userId) {
    return new Response("No DB user id on session", { status: 401 });
  }
  const userId = session.userId;
  const accessToken = session.access_token;

  const force = await readForce(request);

  return createSseResponse<IngestEvent>(async (send) => {
    try {
      // Freshness is re-checked server-side (not only in the client) so that
      // multiple tabs or rapid navigations can't stack redundant ingests.
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { lastIngestAt: true },
      });
      if (!shouldRunIngest(force, user?.lastIngestAt ?? null, new Date())) {
        send({ type: "done", stats: null });
        return;
      }

      const stats = await ingestEmails(
        accessToken,
        userId,
        INGEST_WINDOW_DAYS,
        (message) => send({ type: "progress", message }),
      );
      send({ type: "done", stats });
    } catch (err) {
      console.error("[ingest] run failed:", err);
      send({
        type: "error",
        message: err instanceof Error ? err.message : "同步失敗",
      });
    }
  });
}

// The manual sync button forces past the freshness gate; the automatic paths
// send no body at all. A malformed body is treated as "don't force" rather
// than an error — the worst case is a skipped redundant sync.
async function readForce(request: Request): Promise<boolean> {
  try {
    const body = (await request.json()) as { force?: unknown };
    return body?.force === true;
  } catch {
    return false;
  }
}
