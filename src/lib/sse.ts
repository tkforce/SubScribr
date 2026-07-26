// Server-Sent Events transport, shared by the streaming AI-section routes
// (8a alert analysis, 8b monthly analysis). Deliberately hand-rolled: our
// event schema (progress / tool-call / done / error) doesn't match the
// chat-shaped UIMessage stream protocol the AI SDK's own response helpers
// produce, and those helpers' Node-response variants don't apply to App
// Router route handlers anyway.

export function formatSseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export function createSseResponse<E>(
  run: (send: (event: E) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: E) => {
        controller.enqueue(encoder.encode(formatSseEvent(event)));
      };

      try {
        await run(send);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
