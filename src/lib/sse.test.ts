import { describe, it, expect } from "vitest";
import { formatSseEvent, createSseResponse } from "./sse";

describe("formatSseEvent", () => {
  it("wraps JSON in a data: line followed by a blank line", () => {
    expect(formatSseEvent({ type: "progress", message: "分析中..." })).toBe(
      `data: ${JSON.stringify({ type: "progress", message: "分析中..." })}\n\n`,
    );
  });

  it("serializes arrays and nested objects", () => {
    const event = { type: "done", cards: [{ title: "a" }, { title: "b" }] };
    expect(formatSseEvent(event)).toBe(`data: ${JSON.stringify(event)}\n\n`);
  });
});

describe("createSseResponse", () => {
  async function readAllFrames(response: Response): Promise<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let out = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
    return out;
  }

  it("sets the text/event-stream content type", () => {
    const response = createSseResponse(async () => {});
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("streams every event sent by run, in order", async () => {
    const response = createSseResponse<{ n: number }>(async (send) => {
      send({ n: 1 });
      send({ n: 2 });
    });

    const body = await readAllFrames(response);
    expect(body).toBe(
      `data: ${JSON.stringify({ n: 1 })}\n\n` + `data: ${JSON.stringify({ n: 2 })}\n\n`,
    );
  });

  it("closes the stream after run's promise resolves", async () => {
    const response = createSseResponse<{ n: number }>(async (send) => {
      send({ n: 1 });
    });
    const reader = response.body!.getReader();
    await reader.read(); // the one event
    const final = await reader.read();
    expect(final.done).toBe(true);
  });

  it("still closes the stream when run throws", async () => {
    const response = createSseResponse<{ n: number }>(async () => {
      throw new Error("boom");
    });
    const body = await readAllFrames(response); // must not hang
    expect(body).toBe("");
  });
});
