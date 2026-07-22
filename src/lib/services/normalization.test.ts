import { describe, it, expect } from "vitest";
import {
  SERVICE_REGISTRY,
  normalizeServiceName,
  slugify,
} from "./normalization";

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

  it("slugify keeps CJK characters instead of stripping them to empty", () => {
    expect(slugify("台灣大哥大")).toBe("台灣大哥大");
    expect(slugify("中華電信")).toBe("中華電信");
    expect(slugify("Apple 訂閱")).toBe("apple-訂閱");
  });

  it("slugify falls back to 'unknown' when nothing usable remains", () => {
    expect(slugify("!!!")).toBe("unknown");
    expect(slugify("   ")).toBe("unknown");
  });

  it("returns unmatched=false when raw name not in any alias list", () => {
    const r = normalizeServiceName("Some Brand New Service");
    expect(r.matched).toBe(false);
    expect(r.canonicalId).toBe("some-brand-new-service");
  });

  // Seeded from real LLM rawServiceName output: the same Claude Pro subscription
  // surfaces as "Claude Pro" (Anthropic/Apple receipts), "Anthropic", etc. Without
  // aliases these slugify to distinct ids (claude-pro / anthropic) and split into
  // separate Subscription rows. All variants must collapse to canonical "claude".
  it.each([
    "Claude",
    "Claude Pro",
    "Claude Pro - Monthly",
    "Claude by Anthropic",
    "Anthropic",
    "Anthropic, PBC",
    "Anthropic PBC",
  ])("normalizes Claude variant %j to canonical 'claude'", (raw) => {
    expect(normalizeServiceName(raw).canonicalId).toBe("claude");
  });
});
