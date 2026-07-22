import { normalizeServiceName } from "./normalization";

// Static service knowledge injected into the agent prompt (F5). This is the
// "code provides facts, LLM provides reasoning" boundary: without it the agent
// would hallucinate stale pricing from its training data.
//
// Interface is shaped so the data source can later be swapped (DB table,
// periodic pipeline, RAG) without touching tool or agent code.
//
// lastVerifiedAt marks when the entry was last checked against public pricing
// pages. The prompt formatter surfaces it so the agent can hedge on staleness.

export type PlanTier = {
  name: string;
  amount: number;
  currency: "TWD" | "USD";
  cycle: "monthly" | "yearly";
  notes?: string;
};

export type PriceChange = {
  // Year or year-month; exact days rarely matter for advice
  date: string;
  description: string;
};

export type ServiceKnowledge = {
  id: string;
  displayName: string;
  planTiers: PlanTier[];
  priceHistory: PriceChange[];
  familyPlan?: string;
  cancellationUrl: string;
  notes?: string;
  lastVerifiedAt: string;
};

export const SERVICE_KNOWLEDGE: Record<string, ServiceKnowledge> = {
  cursor: {
    id: "cursor",
    displayName: "Cursor",
    planTiers: [
      { name: "Pro", amount: 20, currency: "USD", cycle: "monthly", notes: "含每月 $20 額度的 credit pool，年繳約省 20%" },
      { name: "Pro+", amount: 60, currency: "USD", cycle: "monthly", notes: "3 倍用量額度" },
      { name: "Ultra", amount: 200, currency: "USD", cycle: "monthly", notes: "20 倍用量額度" },
      { name: "Teams", amount: 40, currency: "USD", cycle: "monthly", notes: "每人每月，含 SSO 與集中帳務" },
    ],
    priceHistory: [
      { date: "2025-06", description: "改為 credit-based 計費（Auto 模式不限量、手選 frontier model 扣額度），同時推出 Ultra $200 方案" },
    ],
    cancellationUrl: "https://cursor.com/dashboard",
    notes: "另有免費 Hobby 方案，付費者降級可考慮",
    lastVerifiedAt: "2026-07-20",
  },
  chatgpt: {
    id: "chatgpt",
    displayName: "ChatGPT",
    planTiers: [
      { name: "Plus", amount: 20, currency: "USD", cycle: "monthly" },
      { name: "Pro", amount: 200, currency: "USD", cycle: "monthly" },
      { name: "Go（台灣）", amount: 290, currency: "TWD", cycle: "monthly", notes: "低價方案，額度較 Plus 少" },
    ],
    priceHistory: [
      { date: "2024-12", description: "推出 Pro $200/月" },
      { date: "2025", description: "推出低價 Go 方案（台灣 NT$290/月）" },
    ],
    cancellationUrl: "https://chatgpt.com/#settings",
    notes: "經 App Store／Google Play 訂閱者價格可能較高，且需至商店的訂閱管理頁取消",
    lastVerifiedAt: "2026-07-20",
  },
  claude: {
    id: "claude",
    displayName: "Claude",
    planTiers: [
      { name: "Pro", amount: 20, currency: "USD", cycle: "monthly", notes: "年繳約 $17/月" },
      { name: "Max (5x)", amount: 100, currency: "USD", cycle: "monthly" },
      { name: "Max (20x)", amount: 200, currency: "USD", cycle: "monthly" },
    ],
    priceHistory: [
      { date: "2025", description: "推出 Max 方案（$100／$200 兩檔）" },
    ],
    cancellationUrl: "https://claude.ai/settings/billing",
    notes: "經 App Store 訂閱（帳單顯示 Anthropic, PBC）者需至 App Store 訂閱管理取消，且定價可能與官網不同",
    lastVerifiedAt: "2026-01",
  },
  netflix: {
    id: "netflix",
    displayName: "Netflix",
    planTiers: [
      { name: "基本", amount: 290, currency: "TWD", cycle: "monthly", notes: "720p、1 台裝置" },
      { name: "標準", amount: 380, currency: "TWD", cycle: "monthly", notes: "1080p、2 台裝置，可加購 1 位額外成員（每月 NT$100）" },
      { name: "高級", amount: 460, currency: "TWD", cycle: "monthly", notes: "4K+HDR、4 台裝置，可加購 2 位額外成員（每月 NT$100）" },
    ],
    priceHistory: [
      { date: "2025", description: "台灣全面調漲：基本 270→290、標準 330→380、高級 390→460" },
      { date: "2026", description: "美國再度宣布調漲，台灣可能跟進" },
    ],
    familyPlan: "無傳統家庭方案；非同住共享須以「額外成員」加購（每月 NT$100／人），僅標準與高級方案可加購",
    cancellationUrl: "https://www.netflix.com/cancelplan",
    lastVerifiedAt: "2026-07-20",
  },
  spotify: {
    id: "spotify",
    displayName: "Spotify",
    planTiers: [
      { name: "Premium 個人", amount: 168, currency: "TWD", cycle: "monthly" },
      { name: "Premium 雙人", amount: 228, currency: "TWD", cycle: "monthly", notes: "2 位同住者" },
      { name: "Premium 家庭", amount: 298, currency: "TWD", cycle: "monthly", notes: "最多 6 位同住者，各自獨立帳戶" },
      { name: "Premium 學生", amount: 88, currency: "TWD", cycle: "monthly", notes: "需學籍驗證，最長 4 年" },
    ],
    priceHistory: [
      { date: "2025-09", description: "台灣調漲：個人 149→168、學生 75→88，雙人與家庭同步調漲（家庭現為 298）" },
    ],
    familyPlan: "家庭方案 6 人平均每人約 NT$50/月；訂個人方案且家中有 2 人以上使用時，改家庭方案通常更划算",
    cancellationUrl: "https://www.spotify.com/tw/account/subscription/",
    lastVerifiedAt: "2026-07-20",
  },
  youtube_premium: {
    id: "youtube_premium",
    displayName: "YouTube Premium",
    planTiers: [
      { name: "個人", amount: 199, currency: "TWD", cycle: "monthly", notes: "Android／網頁訂閱價；經 iOS App 內購為 NT$260" },
      { name: "家庭", amount: 479, currency: "TWD", cycle: "monthly", notes: "最多 6 位同住者；iOS 內購為 NT$630" },
      { name: "學生", amount: 119, currency: "TWD", cycle: "monthly" },
    ],
    priceHistory: [
      { date: "2023", description: "個人 179→199" },
      { date: "2025", description: "家庭方案調漲至 479" },
      { date: "2026-04", description: "美國調漲（個人 US$13.99→15.99），台灣尚未跟進，短期內有調漲風險" },
    ],
    familyPlan: "家庭方案 6 人，要求同住並會驗證；平均每人約 NT$80/月",
    cancellationUrl: "https://www.youtube.com/paid_memberships",
    notes: "iOS App 內購貴約 30%，若目前經 iOS 訂閱，改由網頁訂閱可立省差價",
    lastVerifiedAt: "2026-07-20",
  },
  disney_plus: {
    id: "disney_plus",
    displayName: "Disney+",
    planTiers: [
      { name: "標準（月繳）", amount: 285, currency: "TWD", cycle: "monthly", notes: "1080p、2 台裝置" },
      { name: "標準（年繳）", amount: 2790, currency: "TWD", cycle: "yearly" },
      { name: "高級（月繳）", amount: 335, currency: "TWD", cycle: "monthly", notes: "4K+HDR、杜比全景聲、4 台裝置" },
      { name: "高級（年繳）", amount: 3280, currency: "TWD", cycle: "yearly" },
    ],
    priceHistory: [
      { date: "2023-11", description: "由單一方案（NT$270）拆分為標準／高級兩級" },
      { date: "2025", description: "調漲至標準 285／高級 335" },
    ],
    familyPlan: "非同住共享須加購「額外成員」（每月 NT$80）；電信合約價（如台灣大哥大 24 個月約 NT$199/月）常低於官方價",
    cancellationUrl: "https://www.disneyplus.com/account",
    notes: "年繳較月繳省約 15–22%，長期觀看者建議年繳",
    lastVerifiedAt: "2026-07-20",
  },
  apple_one: {
    id: "apple_one",
    displayName: "Apple One",
    planTiers: [
      { name: "個人", amount: 390, currency: "TWD", cycle: "monthly", notes: "Apple Music + Apple TV + Apple Arcade + iCloud+ 50GB" },
      { name: "家庭", amount: 490, currency: "TWD", cycle: "monthly", notes: "同內容 + iCloud+ 200GB，6 人共享" },
    ],
    priceHistory: [
      { date: "2026", description: "Apple Music 家庭方案調漲至 NT$295，Apple One 價格暫未調整（bundle 相對划算度提高）" },
    ],
    familyPlan: "家庭方案 6 人共享全部服務與 200GB 空間",
    cancellationUrl: "https://apps.apple.com/account/subscriptions",
    notes: "同時單獨訂 Apple Music＋iCloud+ 的費用已接近 Apple One 個人方案，建議檢查是否有重複訂閱可合併",
    lastVerifiedAt: "2026-07-20",
  },
  icloud: {
    id: "icloud",
    displayName: "iCloud+",
    planTiers: [
      { name: "50GB", amount: 30, currency: "TWD", cycle: "monthly" },
      { name: "200GB", amount: 90, currency: "TWD", cycle: "monthly" },
      { name: "2TB", amount: 300, currency: "TWD", cycle: "monthly" },
      { name: "6TB", amount: 900, currency: "TWD", cycle: "monthly" },
      { name: "12TB", amount: 1800, currency: "TWD", cycle: "monthly" },
    ],
    priceHistory: [],
    familyPlan: "200GB 以上方案可與家人共享空間；若已訂 Apple One 則已內含 iCloud+ 空間，單獨再訂即為重複付費",
    cancellationUrl: "https://apps.apple.com/account/subscriptions",
    lastVerifiedAt: "2026-01",
  },
  google_one: {
    id: "google_one",
    displayName: "Google One",
    planTiers: [
      { name: "基本 100GB", amount: 65, currency: "TWD", cycle: "monthly", notes: "年繳 NT$650" },
      { name: "標準 200GB", amount: 90, currency: "TWD", cycle: "monthly" },
      { name: "進階 2TB (Premium)", amount: 330, currency: "TWD", cycle: "monthly", notes: "2026-01 起自動附含 Google AI Plus 權益" },
      { name: "Google AI Plus", amount: 260, currency: "TWD", cycle: "monthly", notes: "含 AI 功能與儲存空間" },
      { name: "Google AI Pro", amount: 650, currency: "TWD", cycle: "monthly", notes: "含 2TB 空間與較高 AI 用量" },
    ],
    priceHistory: [
      { date: "2026-01", description: "Premium 2TB 用戶免費獲得 Google AI Plus 全部權益；若同時訂 2TB 與 AI 方案即為重複付費" },
    ],
    familyPlan: "所有方案皆可與最多 5 位家庭成員共享",
    cancellationUrl: "https://one.google.com/settings",
    lastVerifiedAt: "2026-07-20",
  },
  dropbox: {
    id: "dropbox",
    displayName: "Dropbox",
    planTiers: [
      { name: "Plus (2TB)", amount: 11.99, currency: "USD", cycle: "monthly", notes: "年繳約 $9.99/月" },
      { name: "Essentials (3TB)", amount: 19.99, currency: "USD", cycle: "monthly", notes: "年繳約 $16.58/月" },
    ],
    priceHistory: [],
    familyPlan: "另有 Family 方案（2TB、6 人共享），多人使用時比多個 Plus 便宜",
    cancellationUrl: "https://www.dropbox.com/account/plan",
    notes: "iCloud+／Google One 2TB 的台幣價格通常低於 Dropbox Plus，純備份需求可比價",
    lastVerifiedAt: "2026-01",
  },
  github: {
    id: "github",
    displayName: "GitHub",
    planTiers: [
      { name: "Pro", amount: 4, currency: "USD", cycle: "monthly" },
      { name: "Copilot Pro", amount: 10, currency: "USD", cycle: "monthly", notes: "年繳 $100" },
      { name: "Copilot Pro+", amount: 39, currency: "USD", cycle: "monthly" },
    ],
    priceHistory: [
      { date: "2025", description: "推出 Copilot Pro+（$39/月，含進階 model 用量）" },
    ],
    cancellationUrl: "https://github.com/settings/billing",
    notes: "個人帳單上的 GitHub 扣款多半是 Copilot；若同時訂 Copilot 與 Cursor 等 AI coding 工具，屬常見的功能重疊",
    lastVerifiedAt: "2026-01",
  },
  notion: {
    id: "notion",
    displayName: "Notion",
    planTiers: [
      { name: "Plus", amount: 12, currency: "USD", cycle: "monthly", notes: "每人每月；年繳 $10/月" },
      { name: "Business", amount: 24, currency: "USD", cycle: "monthly", notes: "每人每月；年繳 $20/月，含 Notion AI" },
    ],
    priceHistory: [
      { date: "2025-05", description: "Notion AI 不再單獨加購（原 $10/月 add-on 取消），併入 Business 以上方案" },
    ],
    cancellationUrl: "https://www.notion.so/my-account",
    notes: "個人輕量使用免費版通常已足夠；若付費目的是 AI，需 Business 級距",
    lastVerifiedAt: "2026-01",
  },
  figma: {
    id: "figma",
    displayName: "Figma",
    planTiers: [
      { name: "Professional Full seat", amount: 16, currency: "USD", cycle: "monthly", notes: "年繳價；月繳 $20" },
      { name: "Dev seat", amount: 12, currency: "USD", cycle: "monthly" },
      { name: "Collab seat", amount: 3, currency: "USD", cycle: "monthly" },
    ],
    priceHistory: [
      { date: "2025-03", description: "改為 seat 分級制（Full／Dev／Collab），非設計角色可降級省費" },
    ],
    cancellationUrl: "https://www.figma.com/settings",
    notes: "個人非商用有免費 Starter 方案",
    lastVerifiedAt: "2026-01",
  },
  slack: {
    id: "slack",
    displayName: "Slack",
    planTiers: [
      { name: "Pro", amount: 8.75, currency: "USD", cycle: "monthly", notes: "每人每月；年繳 $7.25/月" },
      { name: "Business+", amount: 15, currency: "USD", cycle: "monthly", notes: "每人每月（年繳）" },
    ],
    priceHistory: [],
    cancellationUrl: "https://my.slack.com/plans",
    notes: "免費版保留 90 天訊息；付費主因通常是歷史訊息與整合數量",
    lastVerifiedAt: "2026-01",
  },
};

export function getServiceKnowledge(serviceName: string): ServiceKnowledge | null {
  // Canonical ids first: slugify would mangle underscores ("youtube_premium").
  const direct = SERVICE_KNOWLEDGE[serviceName];
  if (direct) return direct;

  const { canonicalId } = normalizeServiceName(serviceName);
  return SERVICE_KNOWLEDGE[canonicalId] ?? null;
}

export function formatKnowledgeForPrompt(serviceIds?: string[]): string {
  const ids = serviceIds ?? Object.keys(SERVICE_KNOWLEDGE);
  const sections = ids
    .map((id) => SERVICE_KNOWLEDGE[id])
    .filter((e): e is ServiceKnowledge => e !== undefined)
    .map(formatEntry);

  return [
    "# 訂閱服務知識庫",
    "以下為各服務的方案與定價資料。每條目的「資料查證日期」代表最後人工核對官方定價的時間；引用價格時若查證日期距今較久，請提醒使用者以實際帳單為準。",
    "",
    ...sections,
  ].join("\n");
}

function formatEntry(e: ServiceKnowledge): string {
  const lines: string[] = [`## ${e.displayName}（id: ${e.id}）`];
  lines.push(`資料查證日期：${e.lastVerifiedAt}`);

  lines.push("方案：");
  for (const t of e.planTiers) {
    const cycle = t.cycle === "monthly" ? "月" : "年";
    const price = `${t.currency === "TWD" ? "NT$" : "US$"}${t.amount}/${cycle}`;
    lines.push(`- ${t.name}：${price}${t.notes ? `（${t.notes}）` : ""}`);
  }

  if (e.priceHistory.length > 0) {
    lines.push("價格變動：");
    for (const h of e.priceHistory) {
      lines.push(`- ${h.date}：${h.description}`);
    }
  }

  if (e.familyPlan) lines.push(`家庭／共享：${e.familyPlan}`);
  if (e.notes) lines.push(`備註：${e.notes}`);
  lines.push(`取消訂閱：${e.cancellationUrl}`);
  lines.push("");
  return lines.join("\n");
}
