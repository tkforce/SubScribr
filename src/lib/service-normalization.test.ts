import { describe, it, expect } from "vitest";
import {
  SERVICE_REGISTRY,
  normalizeServiceName,
  slugify,
} from "./service-normalization";

describe("normalizeServiceName", () => {
  it("falls back to slugify when no aliases match (Week 2 default state)", () => {
    const r = normalizeServiceName("Cursor");
    expect(r.matched).toBe(false);
    expect(r.canonicalId).toBe("cursor");
  });

  it("matches exact alias case-insensitively when alias is present", () => {
    const original = [...SERVICE_REGISTRY.netflix.aliases];
    SERVICE_REGISTRY.netflix.aliases = ["Netflix, Inc."];
    try {
      const r = normalizeServiceName("netflix, inc.");
      expect(r).toEqual({ canonicalId: "netflix", matched: true });
    } finally {
      SERVICE_REGISTRY.netflix.aliases = original;
    }
  });

  it("slugify handles punctuation, spaces and unicode safely", () => {
    expect(slugify("Apple One!")).toBe("apple-one");
    expect(slugify("  Disney+  ")).toBe("disney");
    expect(slugify("YouTube   Premium")).toBe("youtube-premium");
    expect(slugify("---weird---")).toBe("weird");
  });

  it("returns unmatched=false when raw name not in any alias list", () => {
    const r = normalizeServiceName("Some Brand New Service");
    expect(r.matched).toBe(false);
    expect(r.canonicalId).toBe("some-brand-new-service");
  });
});
