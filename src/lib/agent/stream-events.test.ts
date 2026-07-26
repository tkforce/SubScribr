import { describe, it, expect } from "vitest";
import { toToolProgressEvent } from "./stream-events";

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
