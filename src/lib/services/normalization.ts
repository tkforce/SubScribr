export type ServiceCategory =
  | "entertainment"
  | "productivity"
  | "ai"
  | "cloud"
  | "comm"
  | "other";

export type ServiceDefinition = {
  id: string;
  displayName: string;
  category: ServiceCategory;
  aliases: string[];
};

// Week 2: canonical IDs only. Aliases stay empty until Week 5 backfill,
// where we'll seed them from the LLM's real rawServiceName distribution.
export const SERVICE_REGISTRY: Record<string, ServiceDefinition> = {
  cursor: { id: "cursor", displayName: "Cursor", category: "ai", aliases: [] },
  chatgpt: { id: "chatgpt", displayName: "ChatGPT", category: "ai", aliases: [] },
  claude: {
    id: "claude",
    displayName: "Claude",
    category: "ai",
    // Seeded from real LLM rawServiceName output. The same Claude Pro
    // subscription surfaces under several brand strings across Anthropic and
    // Apple App Store receipts; without these they slugify to distinct ids and
    // split into separate Subscription rows.
    aliases: [
      "claude",
      "claude pro",
      "claude pro - monthly",
      "claude by anthropic",
      "anthropic",
      "anthropic, pbc",
      "anthropic pbc",
    ],
  },
  netflix: { id: "netflix", displayName: "Netflix", category: "entertainment", aliases: [] },
  spotify: { id: "spotify", displayName: "Spotify", category: "entertainment", aliases: [] },
  youtube_premium: { id: "youtube_premium", displayName: "YouTube Premium", category: "entertainment", aliases: [] },
  disney_plus: { id: "disney_plus", displayName: "Disney+", category: "entertainment", aliases: [] },
  apple_one: { id: "apple_one", displayName: "Apple One", category: "entertainment", aliases: [] },
  icloud: { id: "icloud", displayName: "iCloud+", category: "cloud", aliases: [] },
  google_one: { id: "google_one", displayName: "Google One", category: "cloud", aliases: [] },
  dropbox: { id: "dropbox", displayName: "Dropbox", category: "cloud", aliases: [] },
  github: { id: "github", displayName: "GitHub", category: "productivity", aliases: [] },
  notion: { id: "notion", displayName: "Notion", category: "productivity", aliases: [] },
  figma: { id: "figma", displayName: "Figma", category: "productivity", aliases: [] },
  slack: { id: "slack", displayName: "Slack", category: "comm", aliases: [] },
};

export function normalizeServiceName(raw: string): {
  canonicalId: string;
  matched: boolean;
} {
  const normalized = raw.trim().toLowerCase();

  for (const [id, def] of Object.entries(SERVICE_REGISTRY)) {
    if (def.aliases.some((a) => a.toLowerCase() === normalized)) {
      return { canonicalId: id, matched: true };
    }
  }

  return { canonicalId: slugify(raw), matched: false };
}

export function slugify(s: string): string {
  // Keep Unicode letters/numbers (incl. CJK) — stripping to ASCII-only would
  // collapse every Chinese-named service to "" and merge them under one id.
  const out = s
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return out || "unknown";
}
