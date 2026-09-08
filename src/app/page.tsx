import Link from "next/link";
import { auth } from "@/auth";
import { signInWithGoogle, signOutAction } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatRow } from "@/app/dashboard/stat-row";
import { AnalysisSection } from "@/app/dashboard/analysis-section";
import { TrendChart } from "@/app/dashboard/trend-chart";
import { SubscriptionList } from "@/app/dashboard/subscription-list";
import { INGEST_WINDOW_DAYS } from "@/lib/constants";
import { computeMonthDelta } from "@/lib/queries/monthly-trend";
import type { Analysis } from "@/lib/agent/analysis";
import type { MonthlyTrendPoint } from "@/lib/queries/monthly-trend";
import type { SubscriptionView } from "@/lib/queries/subscriptions";

export default async function Home() {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden text-foreground">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-400/30 via-fuchsia-400/20 to-transparent blur-3xl dark:from-indigo-500/20 dark:via-fuchsia-500/10" />
        <div className="absolute top-40 -right-24 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-emerald-300/30 via-cyan-300/20 to-transparent blur-3xl dark:from-emerald-500/15 dark:via-cyan-500/10" />
        <div className="absolute bottom-0 -left-24 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-rose-300/30 via-amber-300/20 to-transparent blur-3xl dark:from-rose-500/15 dark:via-amber-500/10" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.04)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)]" />
      </div>

      {/* Navigation */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M3 12c0-4.97 4.03-9 9-9 4.97 0 9 4.03 9 9" />
              <path d="M21 12c0 4.97-4.03 9-9 9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Sub
            <span className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">
              Scribr
            </span>
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-zinc-600 dark:text-zinc-400 md:flex">
          <a href="#features" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
            Features
          </a>
          <a href="#how-it-works" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
            How it works
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="hidden text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 sm:inline"
              >
                {user.email}
              </Link>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <form action={signInWithGoogle}>
              <button
                type="submit"
                className="cursor-pointer rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Connect Gmail
              </button>
            </form>
          )}
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-6 pt-16 pb-24 sm:px-8 sm:pt-24 sm:pb-32">
          <div className="flex flex-col items-center text-center">
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
              Find every subscription{" "}
              <span className="bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-rose-500 bg-clip-text text-transparent">
                hiding in your inbox
              </span>
              .
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              SubScribr connects to Gmail (read-only), reads the past 90 days of billing emails and lists all your active subscriptions in one place — when they renew, how much they cost,
              and tells you how to optimize your spending.
            </p>
            <div className="mt-10 flex w-full max-w-md flex-col items-center gap-3">
              {user ? (
                <Link
                  href="/dashboard"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-6 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40"
                >
                  Go to dashboard
                </Link>
              ) : (
                <form action={signInWithGoogle} className="w-full sm:w-auto">
                  <button
                    type="submit"
                    className="cursor-pointer inline-flex h-12 w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-6 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40 sm:w-auto"
                  >
                    <GoogleMark />
                    Connect Gmail with Google
                  </button>
                </form>
              )}
            </div>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
              {/* "Cancel anytime" was here, which implies a paid plan we
                  don't have — the only thing there is to cancel is us. */}
              Read-only Gmail access · Email bodies never stored · Disconnect
              anytime
            </p>
          </div>

          {/* Hero preview card */}
          <DashboardPreview now={new Date()} />
        </section>

        {/* Features */}
        <section
          id="features"
          className="mx-auto w-full max-w-6xl px-6 py-20 sm:px-8 sm:py-28"
        >
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Why SubScribr
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Built around your inbox, not your bank statement.
            </h2>
            <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400">
              Receipts are where subscriptions are actually born. SubScribr reads
              them the way you would — bilingually, in the right currency — and
              then throws the email away, keeping only what it learned.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group relative overflow-hidden rounded-2xl border border-white/60 bg-white/60 p-6 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-zinc-900/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:shadow-black/30"
              >
                <div
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${f.color} text-white shadow-md`}
                >
                  {f.icon}
                </div>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="mx-auto w-full max-w-6xl px-6 py-20 sm:px-8 sm:py-28"
        >
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-400">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              From inbox to insight in under a minute.
            </h2>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-white/60 text-sm font-semibold dark:border-white/10 dark:bg-white/[0.03]">
                  {i + 1}
                </div>
                <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA. One button, the same one as the header — the page used to end
            on a waitlist form with no handler and no endpoint behind it, which
            is the one thing on a landing page that must not be a mockup. */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-24 sm:px-8 sm:pb-32">
          <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-rose-500 p-10 text-white shadow-2xl shadow-indigo-500/20 sm:p-16 dark:border-white/10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_50%)]" />
            <div className="relative mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Stop guessing what you&apos;re paying for.
              </h2>
              <p className="mt-4 text-base text-white/80">
                One sign-in, then about a minute of scanning. Read-only access,
                no card, nothing written back to your inbox.
              </p>
              <div className="mt-8 flex justify-center">
                {user ? (
                  <Link
                    href="/dashboard"
                    className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-medium text-zinc-900 shadow-lg transition hover:bg-zinc-100"
                  >
                    Go to my subscriptions
                  </Link>
                ) : (
                  <form action={signInWithGoogle}>
                    <button
                      type="submit"
                      className="inline-flex h-12 cursor-pointer items-center justify-center gap-3 rounded-full bg-white px-6 text-sm font-medium text-zinc-900 shadow-lg transition hover:bg-zinc-100"
                    >
                      <GoogleMark />
                      Connect Gmail with Google
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-200 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-zinc-500 sm:flex-row sm:px-8">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xs font-bold text-white">
              S
            </span>
            <span>© {new Date().getFullYear()} SubScribr. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
              Privacy
            </a>
            <a href="#" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
              Terms
            </a>
            <a href="#" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Local presentational components (server-safe) ---------- */

// The hero preview renders the *actual* dashboard components with mock data,
// the way /dev/preview does — not a hand-drawn imitation of them. The previous
// mock had quietly drifted into advertising a product we don't ship: two
// separate AI sections, per-card Keep / Snooze / Go cancel buttons, and a
// `conf 0.98` column for a confidence score the pipeline deliberately never
// stores. Importing the real components means the landing page can't claim a
// UI the dashboard doesn't have — if a section changes shape, this changes
// with it.
function DashboardPreview({ now }: { now: Date }) {
  const trendPoints = previewTrend(now);
  return (
    <div className="relative mx-auto mt-20 max-w-5xl">
      <div className="rounded-2xl border border-white/60 bg-white/60 p-2 shadow-2xl shadow-zinc-900/10 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-black/40">
        {/* The dashboard's own page background, scaled down to this frame, so
            the glass surfaces sit on the backdrop they were designed against
            instead of on the landing page's grid-and-blobs. */}
        <div className="relative isolate overflow-hidden rounded-xl bg-background px-5 pt-5 pb-6 sm:px-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              backgroundImage: [
                "radial-gradient(22rem 15rem at 12% -8%, var(--glow-1), transparent 62%)",
                "radial-gradient(18rem 14rem at 98% 18%, var(--glow-2), transparent 62%)",
                "radial-gradient(20rem 13rem at 75% 95%, var(--glow-3), transparent 62%)",
                "radial-gradient(15rem 12rem at -5% 70%, var(--glow-4), transparent 62%)",
              ].join(","),
            }}
          />

          {/* Stands in for the dashboard header. Not a heading element: this is
              a picture of a screen, and it shouldn't enter the page outline. */}
          <div className="mb-6 flex items-baseline justify-between gap-3">
            <p className="text-xl font-semibold tracking-tight">Overview</p>
            <p className="text-xs text-muted-foreground">Last synced: 3m ago</p>
          </div>

          {/* The delta is read out of the trend the same way the dashboard
              reads it, so the stat row's "+NT$106" and the last two bars of
              the chart below can't disagree. */}
          <StatRow
            totalMonthlyTwd={PREVIEW_MONTHLY_TWD}
            activeCount={PREVIEW_SUBS.length}
            delta={computeMonthDelta(trendPoints)}
          />
          {/* stale={false} keeps this inert — the section only calls the agent
              when the server says its analysis is behind the event log. */}
          <AnalysisSection
            initial={PREVIEW_ANALYSIS}
            freshnessLabel="Analyzed 12m ago"
            stale={false}
            hasSubscriptions
          />
          <TrendChart points={trendPoints} />
          <SubscriptionList subscriptions={PREVIEW_SUBS} now={now} />
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <span className="grid h-6 w-6 place-items-center rounded-full bg-white">
      <svg viewBox="0 0 18 18" className="h-3.5 w-3.5" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.79 2.72v2.26h2.9c1.7-1.57 2.69-3.88 2.69-6.62Z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z" />
        <path fill="#FBBC05" d="M3.95 10.7A5.41 5.41 0 0 1 3.66 9c0-.59.1-1.16.29-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.03l2.99-2.33Z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
      </svg>
    </span>
  );
}

/* ---------- Static content ---------- */

// Preview data. Invented, but internally consistent the way a real account is:
// the four services below are exactly the NT$1,344 monthly total in the stat
// row, the headline's "3 things" is the number of insights, and the insights
// state things the four rows support.
function inDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// Six months ending on the current one, keyed the way getMonthlyTrend keys
// them ("YYYY-MM") so the chart's month labels roll forward with the calendar.
// The last two totals are what the stat row's delta and the analysis headline
// are both quoting: 1,238 → 1,344 is +NT$106, of which NT$60 is the Netflix
// increase the second insight describes.
const PREVIEW_MONTHLY_TWD = 1344;
const PREVIEW_TOTALS = [1088, 1145, 1145, 1178, 1238, PREVIEW_MONTHLY_TWD];

function previewTrend(now: Date): MonthlyTrendPoint[] {
  return PREVIEW_TOTALS.map((totalTwd, i) => {
    const d = new Date(
      now.getFullYear(),
      now.getMonth() - (PREVIEW_TOTALS.length - 1 - i),
      1,
    );
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { month, totalTwd };
  });
}

// Relative to today, so the "in 3 days" row keeps earning its badge instead of
// rotting into a past date the moment this file stops being edited.
const PREVIEW_SUBS: SubscriptionView[] = [
  {
    id: "preview-cursor",
    serviceName: "cursor",
    displayName: "Cursor Pro",
    amount: 20,
    currency: "USD",
    amountInTwd: 640,
    cycle: "monthly",
    category: "ai",
    status: "active",
    nextBillingDate: inDays(3),
  },
  {
    id: "preview-netflix",
    serviceName: "netflix",
    displayName: "Netflix",
    amount: 390,
    currency: "TWD",
    amountInTwd: 390,
    cycle: "monthly",
    category: "entertainment",
    status: "active",
    nextBillingDate: inDays(12),
  },
  {
    id: "preview-google-one",
    serviceName: "google-one",
    displayName: "Google One",
    amount: 165,
    currency: "TWD",
    amountInTwd: 165,
    cycle: "monthly",
    category: "cloud",
    status: "active",
    nextBillingDate: inDays(19),
  },
  {
    id: "preview-spotify",
    serviceName: "spotify",
    displayName: "Spotify",
    amount: 149,
    currency: "TWD",
    amountInTwd: 149,
    cycle: "monthly",
    category: "entertainment",
    status: "active",
    nextBillingDate: inDays(24),
  },
];

const PREVIEW_ANALYSIS: Analysis = {
  headline: "Spend is up NT$106 this month, about 9%; 3 things need attention.",
  insights: [
    {
      kind: "alert",
      priority: "high",
      serviceName: "Cursor Pro",
      title: "Cursor Pro renews in 3 days",
      detail:
        "US$20 (about NT$640) renews this week — your largest single monthly fee, at 48% of monthly spend.",
      suggestion:
        "If you haven't used it much this month, check your plan on Cursor's account page before it renews.",
    },
    {
      kind: "change",
      priority: "medium",
      serviceName: "Netflix",
      title: "Netflix is NT$60 more expensive",
      detail:
        "The monthly fee went from NT$330 to NT$390 — about NT$720 more per year.",
    },
    {
      kind: "observation",
      priority: "low",
      serviceName: "Entertainment",
      title: "Entertainment is 40% of monthly spend",
      detail:
        "Netflix and Spotify come to NT$539 a month between them, the second largest category after AI.",
    },
  ],
};

const iconClass = "h-5 w-5";

const features = [
  {
    title: "Gmail-native, read-only ingestion",
    body: "Google OAuth, read-only scope, nothing ever sent. The filtering happens on Gmail's side — a query for billing keywords over the last 90 days — so we fetch dozens of emails rather than thousands, then convert them to plain text in memory and keep only the message id and timestamp.",
    color: "from-indigo-500 to-blue-600",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconClass}
        aria-hidden="true"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    ),
  },
  {
    title: "Bilingual extraction, multi-currency",
    body: "Mixed zh/en receipts go through one structured-output pass: service, amount, currency, billing cycle, category, and what kind of email it is. The model also decides whether it's a subscription at all — what it rejects is dropped, not filed away behind a low score.",
    color: "from-fuchsia-500 to-purple-600",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconClass}
        aria-hidden="true"
      >
        <path d="M5 8h14" />
        <path d="M9 4v4" />
        <path d="M9 16c0-3 3-5 6-5" />
        <path d="m13 20 4-9 4 9" />
        <path d="M14 18h6" />
      </svg>
    ),
  },
  {
    title: "One analysis, not a wall of AI",
    body: "A single agent with four tools — subscriptions, spend trend, anomalies, service pricing — writes one ranked list of 🔴🟡🟢 cards, streaming what it's looking at as it goes. This started as two sections; they kept saying the same thing twice at double the tokens, so they became one.",
    color: "from-rose-500 to-orange-500",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconClass}
        aria-hidden="true"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10 21a2 2 0 0 0 4 0" />
      </svg>
    ),
  },
  {
    title: "An event log you can replay",
    body: "Every receipt becomes an immutable billing event. Your subscription list and the analysis are both folded from that log, so a fix to how state is derived needs one re-sync to repair every account — not a migration script.",
    color: "from-emerald-500 to-teal-600",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconClass}
        aria-hidden="true"
      >
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 5-6" />
      </svg>
    ),
  },
  {
    title: "Renewal dates that mean something",
    body: "The next charge is projected from the most recent receipt plus the billing cycle, with month-end clamping so a charge on the 31st doesn't drift. What's billing this week is flagged in the list — which is the only version of this number worth showing.",
    color: "from-cyan-500 to-blue-500",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconClass}
        aria-hidden="true"
      >
        <path d="M14 3h-9a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9" />
        <path d="M14 3v6h6" />
        <path d="M16 3l5 5" />
        <path d="M8 14h6" />
        <path d="M8 18h4" />
      </svg>
    ),
  },
  {
    title: "Privacy-first by design",
    body: "Read-only Gmail scope, bodies parsed in memory and never persisted. The account boundary isn't something the model can talk its way past either: the user id is bound in a closure, never a parameter a tool call gets to fill in.",
    color: "from-zinc-700 to-zinc-900",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconClass}
        aria-hidden="true"
      >
        <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
];

const steps = [
  {
    title: "Connect Gmail",
    body: `Sign in with Google. Read-only scope, no scary permissions. We read the last ${INGEST_WINDOW_DAYS} days and never write anything back.`,
  },
  {
    title: "AI reads your receipts",
    body: "Candidate emails are parsed in parallel, and each subscription one becomes an immutable billing event. Your list of services is folded back out of that log.",
  },
  {
    title: "Read what changed",
    body: "Each sync ends with an agent ranking what needs attention — renewals landing this week, price changes, where the money actually goes — each card carrying its own one-line suggestion.",
  },
];
