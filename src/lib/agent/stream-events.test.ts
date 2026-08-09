import { describe, it, expect } from "vitest";
import { toToolProgressEvent, extractStreamError } from "./stream-events";

describe("toToolProgressEvent", () => {
  it("maps a tool-call chunk to a tool-call event", () => {
    expect(
      toToolProgressEvent({ type: "tool-call", toolName: "get_service_info" }),
    ).toEqual({ type: "tool-call", toolName: "get_service_info" });
  });

  it("maps a tool-result chunk to a tool-result event", () => {
    expect(
      toToolProgressEvent({ type: "tool-result", toolName: "calculate_trend" }),
    ).toEqual({ type: "tool-result", toolName: "calculate_trend" });
  });

  it("returns null for chunk types that aren't tool activity", () => {
    expect(toToolProgressEvent({ type: "text-delta" })).toBeNull();
    expect(toToolProgressEvent({ type: "finish" })).toBeNull();
    expect(toToolProgressEvent({ type: "start-step" })).toBeNull();
  });
});

describe("extractStreamError", () => {
  it("reads the message out of an Error carried by an error chunk", () => {
    expect(
      extractStreamError({
        type: "error",
        error: new Error("429 Too Many Requests"),
      }),
    ).toEqual({ fatal: true, message: "429 Too Many Requests" });
  });

  it("names the tool on a tool-error chunk, and treats it as non-fatal", () => {
    // The agent gets the tool failure back and can recover, so one bad tool
    // call must not abort the whole run.
    expect(
      extractStreamError({
        type: "tool-error",
        toolName: "calculate_trend",
        error: new Error("boom"),
      }),
    ).toEqual({ fatal: false, message: "calculate_trend failed: boom" });
  });

  it("handles a string error", () => {
    expect(extractStreamError({ type: "error", error: "rate limited" })).toEqual(
      { fatal: true, message: "rate limited" },
    );
  });

  it("serializes a non-Error object rather than rendering [object Object]", () => {
    const out = extractStreamError({
      type: "error",
      error: { status: 429, detail: "quota" },
    });
    expect(out?.fatal).toBe(true);
    expect(out?.message).toContain("429");
    expect(out?.message).not.toContain("[object Object]");
  });

  it("falls back to a readable string when the error is empty", () => {
    const out = extractStreamError({ type: "error", error: undefined });
    expect(out).toEqual({ fatal: true, message: "Unknown stream error" });
  });

  it("returns null for chunks that aren't errors", () => {
    expect(extractStreamError({ type: "text-delta" })).toBeNull();
    expect(
      extractStreamError({ type: "tool-call", toolName: "query_subscriptions" }),
    ).toBeNull();
  });
});
