"use client";

import { useCallback, useRef, useState } from "react";
import { readSseStream } from "@/lib/sse-client";
import { toolProgressLabel } from "@/lib/agent/tool-labels";

// The event shapes both AI sections stream. `done` carries a section-specific
// payload (cards for 8a, analysis for 8b), so it's the generic parameter.
type StreamEvent<TDone> =
  | { type: "progress"; message: string }
  | { type: "tool-call"; toolName: string }
  | { type: "tool-result"; toolName: string }
  | ({ type: "done" } & TDone)
  | { type: "error"; message: string };

export type StreamStatus = "idle" | "streaming" | "done" | "error";

export type AnalysisStream<TDone> = {
  status: StreamStatus;
  progress: string; // current one-line "what the agent is doing" text
  result: TDone | null;
  error: string | null;
  run: () => void;
};

// Drives one AI section's lifecycle: POST the route, read its SSE stream, and
// project the events onto a small state machine (idle → streaming → done/error).
// `progress` always holds the latest single line, never a log — the UI shows
// only what's happening right now.
export function useAnalysisStream<TDone>(
  endpoint: string,
): AnalysisStream<TDone> {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<TDone | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against a double-click firing two overlapping streams.
  const running = useRef(false);

  const run = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setStatus("streaming");
    setProgress("開始分析...");
    setResult(null);
    setError(null);

    (async () => {
      try {
        const res = await fetch(endpoint, { method: "POST" });
        if (!res.ok || !res.body) {
          throw new Error(`分析請求失敗（${res.status}）`);
        }

        for await (const event of readSseStream<StreamEvent<TDone>>(res)) {
          switch (event.type) {
            case "progress":
              setProgress(event.message);
              break;
            case "tool-call":
              setProgress(toolProgressLabel(event.toolName));
              break;
            case "tool-result":
              // A result just means a step finished; keep the current label
              // rather than flashing a redundant line.
              break;
            case "done": {
              const { type: _t, ...payload } = event;
              setResult(payload as unknown as TDone);
              setStatus("done");
              break;
            }
            case "error":
              setError(event.message);
              setStatus("error");
              break;
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "分析失敗");
        setStatus("error");
      } finally {
        running.current = false;
      }
    })();
  }, [endpoint]);

  return { status, progress, result, error, run };
}
