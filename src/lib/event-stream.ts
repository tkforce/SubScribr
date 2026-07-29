import { readSseStream } from "@/lib/sse-client";
import { toolProgressLabel } from "@/lib/agent/tool-labels";

// The event shapes our SSE routes emit. `done` carries a route-specific
// payload (IngestStats for /api/ingest, the analysis for /api/analyze), so it
// is the generic parameter. tool-call/tool-result only occur on agent routes.
export type StreamEvent<TDone> =
  | { type: "progress"; message: string }
  | { type: "tool-call"; toolName: string }
  | { type: "tool-result"; toolName: string }
  | ({ type: "done" } & TDone)
  | { type: "error"; message: string };

export type StreamHandlers<TDone> = {
  onProgress: (message: string) => void;
  onDone: (payload: TDone) => void;
  onError: (message: string) => void;
};

// Reads one SSE response to completion and projects its events onto handlers.
//
// Lives outside the React hook so the terminal-event rule below can be tested
// without a DOM: the hook is left as a thin state wrapper around this.
export async function consumeEventStream<TDone>(
  response: Response,
  handlers: StreamHandlers<TDone>,
): Promise<void> {
  let settled = false;

  for await (const event of readSseStream<StreamEvent<TDone>>(response)) {
    switch (event.type) {
      case "progress":
        handlers.onProgress(event.message);
        break;
      case "tool-call":
        handlers.onProgress(toolProgressLabel(event.toolName));
        break;
      case "tool-result":
        // A result only means a step finished; keep the current label rather
        // than flashing a redundant line.
        break;
      case "done": {
        const payload: Record<string, unknown> = { ...event };
        delete payload.type;
        settled = true;
        handlers.onDone(payload as TDone);
        break;
      }
      case "error":
        settled = true;
        handlers.onError(event.message);
        break;
    }
  }

  // A stream that closes without a terminal event is what a serverless
  // function timeout looks like from here. Left unhandled it reads as work
  // still in progress, so the UI would spin forever on a request that is
  // already dead.
  if (!settled) {
    handlers.onError("連線中斷，處理未完成，請重新嘗試。");
  }
}
