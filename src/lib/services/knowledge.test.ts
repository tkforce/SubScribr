import { describe, expect, it } from "vitest";
import { SERVICE_REGISTRY } from "./normalization";
import {
  SERVICE_KNOWLEDGE,
  formatKnowledgeForPrompt,
  getServiceKnowledge,
} from "./knowledge";

describe("SERVICE_KNOWLEDGE", () => {
  it("covers every service in SERVICE_REGISTRY with matching ids", () => {
    for (const id of Object.keys(SERVICE_REGISTRY)) {
      const entry = SERVICE_KNOWLEDGE[id];
      expect(entry, `missing knowledge entry for "${id}"`).toBeDefined();
      expect(entry.id).toBe(id);
    }
  });

  it("has no entries for services outside the registry", () => {
    for (const id of Object.keys(SERVICE_KNOWLEDGE)) {
      expect(SERVICE_REGISTRY[id], `"${id}" not in SERVICE_REGISTRY`).toBeDefined();
    }
  });

  it("every entry has at least one plan tier, a cancellation url, and a verification date", () => {
    for (const entry of Object.values(SERVICE_KNOWLEDGE)) {
      expect(entry.planTiers.length).toBeGreaterThan(0);
      expect(entry.cancellationUrl).toMatch(/^https:\/\//);
      expect(entry.lastVerifiedAt).toMatch(/^\d{4}-\d{2}(-\d{2})?$/);
    }
  });

  it("plan tiers carry positive amounts in supported currencies", () => {
    for (const entry of Object.values(SERVICE_KNOWLEDGE)) {
      for (const tier of entry.planTiers) {
        expect(tier.amount).toBeGreaterThan(0);
        expect(["TWD", "USD"]).toContain(tier.currency);
      }
    }
  });
});

describe("getServiceKnowledge", () => {
  it("returns the entry for a canonical id", () => {
    const entry = getServiceKnowledge("netflix");
    expect(entry?.displayName).toBe("Netflix");
  });

  it("resolves a raw, non-canonical name via normalization", () => {
    // "Netflix" is not a stored alias; slugify fallback maps it to "netflix"
    const entry = getServiceKnowledge("Netflix");
    expect(entry?.id).toBe("netflix");
  });

  it("returns null for services we have no knowledge about", () => {
    expect(getServiceKnowledge("some-unknown-service")).toBeNull();
  });
});

describe("formatKnowledgeForPrompt", () => {
  it("includes every service by default", () => {
    const text = formatKnowledgeForPrompt();
    for (const entry of Object.values(SERVICE_KNOWLEDGE)) {
      expect(text).toContain(entry.displayName);
    }
  });

  it("can be scoped to a subset of services", () => {
    const text = formatKnowledgeForPrompt(["netflix"]);
    expect(text).toContain("Netflix");
    expect(text).not.toContain("Spotify");
  });

  it("stays within the ~30KB prompt budget", () => {
    const bytes = Buffer.byteLength(formatKnowledgeForPrompt(), "utf8");
    expect(bytes).toBeLessThan(40_000);
    expect(bytes).toBeGreaterThan(3_000); // sanity: not an empty shell
  });
});
