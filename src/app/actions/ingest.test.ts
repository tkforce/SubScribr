import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
  },
}));

const mockIngestEmails = vi.fn();
vi.mock("@/lib/ingestion", () => ({
  ingestEmails: (...args: unknown[]) => mockIngestEmails(...args),
}));

import { ingestSubscriptionEmails } from "./ingest";

const session = {
  user: { email: "a@b.c" },
  access_token: "tok",
  userId: "user-1",
};

const stats = {
  candidateCount: 0,
  skippedExistingCount: 0,
  blacklistedCount: 0,
  notSubscriptionCount: 0,
  missingFieldsCount: 0,
  extractFailedCount: 0,
  ingestedCount: 0,
  subscriptionsUpserted: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(session);
  mockIngestEmails.mockResolvedValue(stats);
});

describe("ingestSubscriptionEmails", () => {
  it("skips when fresh and not forced", async () => {
    mockFindUnique.mockResolvedValue({ lastIngestAt: new Date() });

    const result = await ingestSubscriptionEmails();

    expect(result).toEqual({ skipped: true });
    expect(mockIngestEmails).not.toHaveBeenCalled();
  });

  it("runs when never ingested", async () => {
    mockFindUnique.mockResolvedValue({ lastIngestAt: null });

    const result = await ingestSubscriptionEmails();

    expect(result).toEqual({ skipped: false, stats });
    expect(mockIngestEmails).toHaveBeenCalledWith("tok", "user-1", 90);
  });

  it("runs when forced, even if fresh", async () => {
    mockFindUnique.mockResolvedValue({ lastIngestAt: new Date() });

    const result = await ingestSubscriptionEmails({ force: true });

    expect(result).toEqual({ skipped: false, stats });
    expect(mockIngestEmails).toHaveBeenCalled();
  });
});
