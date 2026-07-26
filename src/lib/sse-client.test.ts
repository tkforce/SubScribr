import { describe, it, expect } from "vitest";
import { parseSseBuffer, readSseStream } from "./sse-client";
import { formatSseEvent } from "./sse";

describe("parseSseBuffer", () => {
  it("parses a single complete frame and leaves no remainder", () => {
    const buffer = formatSseEvent({ type: "progress", message: "hi" });
    expect(parseSseBuffer(buffer)).toEqual({
      events: [{ type: "progress", message: "hi" }],
      rest: "",
    });
  });

  it("parses multiple frames in one buffer, in order", () => {
    const buffer =
      formatSseEvent({ n: 1 }) + formatSseEvent({ n: 2 }) + formatSseEvent({ n: 3 });
    expect(parseSseBuffer(buffer)).toEqual({
      events: [{ n: 1 }, { n: 2 }, { n: 3 }],
      rest: "",
    });
  });

  it("keeps a trailing partial frame as the remainder", () => {
    const whole = formatSseEvent({ n: 1 });
    const buffer = whole + 'data: {"n":2'; // second frame not yet terminated
    expect(parseSseBuffer(buffer)).toEqual({
      events: [{ n: 1 }],
      rest: 'data: {"n":2',
    });
  });

  it("returns no events when nothing is complete yet", () => {
    expect(parseSseBuffer('data: {"n":1')).toEqual({
      events: [],
      rest: 'data: {"n":1',
    });
  });
});

describe("readSseStream", () => {
  function streamOf(...chunks: string[]): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
    return new Response(body);
  }

  it("yields every event across chunk boundaries", async () => {
    // A frame deliberately split across two network chunks.
    const frame = formatSseEvent({ type: "done", value: 42 });
    const mid = Math.floor(frame.length / 2);
    const response = streamOf(
      formatSseEvent({ type: "progress", message: "a" }) + frame.slice(0, mid),
      frame.slice(mid),
    );

    const got: unknown[] = [];
    for await (const event of readSseStream(response)) got.push(event);

    expect(got).toEqual([
      { type: "progress", message: "a" },
      { type: "done", value: 42 },
    ]);
  });
});
