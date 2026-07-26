// Shared by every streaming agent flow (8a alert-analysis, 8b
// monthly-analysis): both are phase1 streamText+tools → phase2 generateObject,
// so both need the same "which tool is the agent calling right now" mapping.

export type StreamChunkLike = { type: string; toolName?: string };

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
