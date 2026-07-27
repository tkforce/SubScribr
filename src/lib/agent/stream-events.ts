// Shared by every streaming agent flow (8a alert-analysis, 8b
// monthly-analysis): both are phase1 streamText+tools → phase2 generateObject,
// so both need the same "which tool is the agent calling right now" mapping.

export type StreamChunkLike = {
  type: string;
  toolName?: string;
  error?: unknown;
};

export type ToolProgressEvent =
  | { type: "tool-call"; toolName: string }
  | { type: "tool-result"; toolName: string };

// Maps a phase-1 fullStream chunk to a user-facing progress event. Returns
// null for chunk types we don't surface (text deltas, step/finish markers) —
// the UI only needs to know which tool is running, not the agent's raw
// token-by-token reasoning.
export function toToolProgressEvent(
  chunk: StreamChunkLike,
): ToolProgressEvent | null {
  if (chunk.type === "tool-call" || chunk.type === "tool-result") {
    return { type: chunk.type, toolName: chunk.toolName! };
  }
  return null;
}

export type StreamFailure = {
  // A top-level `error` chunk means the stream itself died — nothing more is
  // coming, so the run must abort. A `tool-error` is handed back to the model,
  // which can retry or route around it, so it must not abort the run.
  fatal: boolean;
  message: string;
};

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error == null) return "未知的串流錯誤";
  // String(obj) gives "[object Object]", which is exactly the kind of useless
  // message this whole function exists to avoid.
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// Pulls the real failure out of a fullStream chunk.
//
// streamText reports failures as chunks rather than by rejecting the
// iteration, so a consumer that only looks for tool activity drops them
// silently — the run then finishes with zero steps and the SDK throws a
// generic "No output generated. Check the stream for errors." from the
// awaited result, which names neither the cause nor the layer it came from.
export function extractStreamError(
  chunk: StreamChunkLike,
): StreamFailure | null {
  if (chunk.type === "error") {
    return { fatal: true, message: describe(chunk.error) };
  }
  if (chunk.type === "tool-error") {
    return {
      fatal: false,
      message: `${chunk.toolName ?? "工具"} 失敗：${describe(chunk.error)}`,
    };
  }
  return null;
}
