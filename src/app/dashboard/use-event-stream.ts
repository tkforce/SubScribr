"use client";

import { useCallback, useRef, useState } from "react";
import { consumeEventStream } from "@/lib/event-stream";

export type StreamStatus = "idle" | "streaming" | "done" | "error";

export type EventStream<TDone> = {
  status: StreamStatus;
  progress: string; // the latest single line, never a log
  result: TDone | null;
  error: string | null;
  run: (body?: Record<string, unknown>) => void;
};

// Drives one streaming route's lifecycle: POST it, consume its SSE stream, and
// project the events onto a small state machine (idle → streaming → done/error).
//
// All the stream-reading rules live in consumeEventStream so they can be tested
// without a DOM; what is left here is React state and the double-run guard.
export function useEventStream<TDone>(
  endpoint: string,
  initialProgress: string,
): EventStream<TDone> {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<TDone | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against a double-click firing two overlapping streams.
  const running = useRef(false);

  const run = useCallback(
    (body?: Record<string, unknown>) => {
      if (running.current) return;
      running.current = true;
      setStatus("streaming");
      setProgress(initialProgress);
      setResult(null);
      setError(null);

      (async () => {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            ...(body
              ? {
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                }
              : {}),
          });
          if (!res.ok || !res.body) {
            throw new Error(`Request failed (${res.status})`);
          }

          await consumeEventStream<TDone>(res, {
            onProgress: setProgress,
            onDone: (payload) => {
              setResult(payload);
              setStatus("done");
            },
            onError: (message) => {
              setError(message);
              setStatus("error");
            },
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Something went wrong");
          setStatus("error");
        } finally {
          running.current = false;
        }
      })();
    },
    [endpoint, initialProgress],
  );

  return { status, progress, result, error, run };
}
