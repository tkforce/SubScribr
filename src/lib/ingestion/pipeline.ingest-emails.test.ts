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

vi.mock("@/lib/ingestion/gmail", () => ({
  buildSubscriptionQuery: vi.fn(() => "test-query"),
  listMessageIds: vi.fn(async () => []),
  fetchMessagesByIds: vi.fn(async () => []),
}));

vi.mock("@/lib/ingestion/extraction", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  llmExtract: vi.fn(async () => ({ isSubscriptionRelated: false as const })),
}));

import { db } from "@/lib/db";
import { listMessageIds, fetchMessagesByIds } from "@/lib/ingestion/gmail";
import { ingestEmails } from "./pipeline";

function email(id: string) {
  return {
    id,
    from: "billing@example.com",
    subject: "Receipt",
    date: "Wed, 29 Jul 2026 05:00:00 +0000",
    snippet: "",
    body: "receipt",
  };
}

describe("ingestEmails", () => {
  it("updates lastIngestAt even when there are no new emails", async () => {
    const stats = await ingestEmails("access-token", "user-1", 90);

    expect(stats.ingestedCount).toBe(0);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lastIngestAt: expect.any(Date) },
    });
  });

  it("reports the candidate count as soon as Gmail answers", async () => {
    vi.mocked(listMessageIds).mockResolvedValueOnce(["a", "b", "c"]);
    vi.mocked(fetchMessagesByIds).mockResolvedValueOnce([]);
    const messages: string[] = [];

    await ingestEmails("access-token", "user-1", 90, (m) => messages.push(m));

    expect(messages).toContain("Filtering on Gmail… 3 candidates");
  });

  it("reports progress once per email examined", async () => {
    vi.mocked(listMessageIds).mockResolvedValueOnce(["a", "b"]);
    vi.mocked(fetchMessagesByIds).mockResolvedValueOnce([
      email("a"),
      email("b"),
    ]);
    const messages: string[] = [];

    await ingestEmails("access-token", "user-1", 90, (m) => messages.push(m));

    // The running counter is what makes a 56-second first sync legible, so
    // assert both ticks arrive rather than just "some progress happened".
    expect(messages.filter((m) => m.includes("1 of 2"))).toHaveLength(1);
    expect(messages.filter((m) => m.includes("2 of 2"))).toHaveLength(1);
  });

  it("runs unchanged when no progress handler is passed", async () => {
    vi.mocked(listMessageIds).mockResolvedValueOnce(["a"]);
    vi.mocked(fetchMessagesByIds).mockResolvedValueOnce([email("a")]);

    const stats = await ingestEmails("access-token", "user-1", 90);

    expect(stats.candidateCount).toBe(1);
    expect(stats.notSubscriptionCount).toBe(1);
  });
});
