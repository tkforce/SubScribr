import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    billingEvent: {
      findMany: vi.fn(async () => []),
      createMany: vi.fn(async () => ({ count: 0 })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    subscription: { upsert: vi.fn() },
    user: { update: vi.fn(async () => ({})) },
  },
}));

vi.mock("@/lib/gmail", () => ({
  buildSubscriptionQuery: vi.fn(() => "test-query"),
  listMessageIds: vi.fn(async () => []),
  fetchMessagesByIds: vi.fn(async () => []),
}));

import { db } from "@/lib/db";
import { ingestEmails } from "./ingestion";

describe("ingestEmails", () => {
  it("updates lastIngestAt even when there are no new emails", async () => {
    const stats = await ingestEmails("access-token", "user-1", 90);

    expect(stats.ingestedCount).toBe(0);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lastIngestAt: expect.any(Date) },
    });
  });
});
