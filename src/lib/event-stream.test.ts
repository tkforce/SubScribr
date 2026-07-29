import { describe, it, expect, vi } from "vitest";
import { consumeEventStream } from "./event-stream";
import { formatSseEvent } from "./sse";

function streamOf(...events: unknown[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(formatSseEvent(e)));
      controller.close();
    },
  });
  return new Response(body);
}

function handlers() {
  return {
    onProgress: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };
}

describe("consumeEventStream", () => {
  it("hands the done payload over without its discriminant", async () => {
    const h = handlers();

    await consumeEventStream(
      streamOf({ type: "done", stats: { ingestedCount: 3 } }),
      h,
    );

    expect(h.onDone).toHaveBeenCalledWith({ stats: { ingestedCount: 3 } });
    expect(h.onError).not.toHaveBeenCalled();
  });

  it("forwards progress messages in order", async () => {
    const h = handlers();

    await consumeEventStream(
      streamOf(
        { type: "progress", message: "連線 Gmail⋯" },
        { type: "progress", message: "AI 判讀中⋯1 / 2" },
        { type: "done" },
      ),
      h,
    );

    expect(h.onProgress.mock.calls.map((c) => c[0])).toEqual([
      "連線 Gmail⋯",
      "AI 判讀中⋯1 / 2",
    ]);
  });

  it("treats a stream that ends without done as a failure", async () => {
    // This is exactly what a serverless function timeout looks like from the
    // client: the connection closes mid-work with no terminal event. Without
    // this the UI sits on a spinner forever instead of reporting the failure.
    const h = handlers();

    await consumeEventStream(
      streamOf({ type: "progress", message: "AI 判讀中⋯40 / 300" }),
      h,
    );

    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(h.onDone).not.toHaveBeenCalled();
  });

  it("does not add a second failure when the server already reported one", async () => {
    const h = handlers();

    await consumeEventStream(
      streamOf({ type: "error", message: "Gmail 連線已過期" }),
      h,
    );

    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(h.onError).toHaveBeenCalledWith("Gmail 連線已過期");
  });
});
