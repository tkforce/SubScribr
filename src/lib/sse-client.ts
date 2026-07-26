// Client-side counterpart to sse.ts. The browser's native EventSource only
// does GET with no body, but our analysis routes are POST (they trigger a
// per-user side effect), so we consume the SSE stream by hand over fetch's
// ReadableStream instead.

export type ParseResult<E> = { events: E[]; rest: string };

// Splits an accumulated text buffer into complete SSE events, returning any
// trailing partial frame as `rest` to be prepended to the next chunk. A frame
// is `data: <json>\n\n`; we only use the data field (no event:/id:/retry:).
export function parseSseBuffer<E = unknown>(buffer: string): ParseResult<E> {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? ""; // last piece is incomplete until its \n\n arrives
  const events: E[] = [];
  for (const part of parts) {
    const line = part.replace(/^data: /, "");
    if (line.length === 0) continue;
    events.push(JSON.parse(line) as E);
  }
  return { events, rest };
}

// Reads a fetch Response body as an SSE stream, yielding each parsed event.
export async function* readSseStream<E = unknown>(
  response: Response,
): AsyncGenerator<E> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseBuffer<E>(buffer);
    buffer = rest;
    for (const event of events) yield event;
  }
}
