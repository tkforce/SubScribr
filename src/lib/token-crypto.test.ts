import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./token-crypto";

describe("token-crypto", () => {
  const originalSecret = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.AUTH_SECRET = originalSecret;
  });

  it("round-trips a token", () => {
    const token = "1//0abcDEF-refresh-token-value";
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it("produces a different ciphertext per call (random IV)", () => {
    expect(encryptToken("same")).not.toBe(encryptToken("same"));
  });

  it("returns null for malformed payloads", () => {
    expect(decryptToken("not-base64-!!")).toBeNull();
    expect(decryptToken("")).toBeNull();
    expect(decryptToken(Buffer.from("too short").toString("base64"))).toBeNull();
  });

  it("returns null when encrypted with a different secret", () => {
    const payload = encryptToken("secret-token");
    process.env.AUTH_SECRET = "rotated-secret";
    expect(decryptToken(payload)).toBeNull();
  });

  it("throws when AUTH_SECRET is missing", () => {
    delete process.env.AUTH_SECRET;
    expect(() => encryptToken("x")).toThrow("AUTH_SECRET");
  });
});
