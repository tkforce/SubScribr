import Link from "next/link";
import { auth } from "@/auth";
import { signInWithGoogle, signOutAction } from "@/app/actions/auth";

export default async function Home() {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-white text-zinc-900 dark:bg-[#0a0a0f] dark:text-zinc-100">
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
          <a href="#accuracy" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
            Accuracy
          </a>
        </nav>
        <div className="flex items-center gap-3">
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
              Read-only Gmail access · Never sold · Cancel anytime
            </p>
          </div>

          {/* Hero preview card */}
          <div className="relative mx-auto mt-20 max-w-5xl">
            <div className="rounded-2xl border border-zinc-200 bg-white/80 p-2 shadow-2xl shadow-zinc-900/10 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.03] dark:shadow-black/40">
              <div className="rounded-xl bg-zinc-50 p-6 dark:bg-zinc-950/60 sm:p-8">
                <div className="grid gap-6 lg:grid-cols-5">
                  {/* Left: This Week Needs Attention */}
                  <div className="lg:col-span-2">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                          This week
                        </p>
                        <p className="mt-1 text-base font-semibold">
                          3 things to look at
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
                        AI agent
                      </span>
                    </div>
                    <div className="space-y-3">
                      <AlertCard
                        priority="high"
                        title="ChatGPT Plus 3 days to renewal"
                        body="USD $20.00 · Last opened 47 days ago. Likely a cancel candidate."
                        primary="Go cancel"
                        secondary="Keep"
                      />
                      <AlertCard
                        priority="medium"
                        title="KKBOX Family renews at end of month"
                        body="NT$298 · Price alert — was NT$249 a year ago (+19.7%)."
                        primary="Details"
                        secondary="Keep"
                      />
                      <AlertCard
                        priority="low"
                        title="iCloud+ 200GB renews Friday"
                        body="NT$90 · 82% usage this quarter — worth keeping."
                        primary="Snooze"
                        secondary="OK"
                      />
                    </div>
                  </div>

                  {/* Right: Monthly overview + subscription list */}
                  <div className="lg:col-span-3">
                    <div className="mb-4 grid grid-cols-3 gap-3">
                      <Stat label="This month" value="NT$3,847" trend="+12% MoM" trendColor="text-rose-500" />
                      <Stat label="Active" value="14" trend="2 new" trendColor="text-zinc-500" />
                      <Stat label="Saved YTD" value="NT$2,140" trend="↓ cancelled" trendColor="text-emerald-500" />
                    </div>
                    <div className="space-y-2">
                      {[
                        {
                          name: "ChatGPT Plus",
                          tag: "AI · Renews in 3 days",
                          price: "$20.00",
                          color: "from-emerald-500 to-teal-600",
                          initial: "G",
                          confidence: 0.98,
                          warn: true,
                        },
                        {
                          name: "Notion",
                          tag: "Productivity · Monthly",
                          price: "$10.00",
                          color: "from-zinc-700 to-zinc-900",
                          initial: "N",
                          confidence: 0.99,
                        },
                        {
                          name: "KKBOX Family",
                          tag: "Music · End of month",
                          price: "NT$298",
                          color: "from-sky-500 to-blue-600",
                          initial: "K",
                          confidence: 0.94,
                          warn: true,
                        },
                        {
                          name: "Netflix Premium",
                          tag: "Streaming · Monthly",
                          price: "NT$390",
                          color: "from-rose-500 to-red-600",
                          initial: "N",
                          confidence: 0.97,
                        },
                        {
                          name: "iCloud+ 200GB",
                          tag: "Storage · Friday",
                          price: "NT$90",
                          color: "from-zinc-500 to-zinc-700",
                          initial: "i",
                          confidence: 0.96,
                        },
                      ].map((s) => (
                        <div
                          key={s.name}
                          className="flex items-center justify-between rounded-lg border border-zinc-200/70 bg-white px-3 py-2.5 dark:border-white/5 dark:bg-white/[0.03]"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br ${s.color} text-sm font-semibold text-white`}
                            >
                              {s.initial}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{s.name}</p>
                              <p className="text-xs text-zinc-500">{s.tag}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="hidden font-mono text-[10px] text-zinc-400 sm:inline">
                              conf {s.confidence.toFixed(2)}
                            </span>
                            {s.warn && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                                Renewing
                              </span>
                            )}
                            <p className="text-sm font-medium tabular-nums">{s.price}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute -inset-x-8 -bottom-8 -z-10 h-32 bg-gradient-to-t from-white to-transparent dark:from-[#0a0a0f]" />
          </div>
        </section>

        {/* Streaming-progress strip */}
        <section className="mx-auto w-full max-w-5xl px-6 pb-20 sm:px-8">
          <div className="rounded-2xl border border-zinc-200 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.03] sm:p-8">
            <p className="text-sm font-medium uppercase tracking-wider text-zinc-500">
              First-time onboarding · streaming progress
            </p>
            <div className="mt-4 space-y-2 font-mono text-sm">
              <ProgressLine done>Scanning the last 90 days of email… 127 candidates found</ProgressLine>
              <ProgressLine done>HTML → plain text · thread dedupe complete</ProgressLine>
              <ProgressLine done>LLM extracting… 8 subscriptions identified</ProgressLine>
              <ProgressLine done>LLM extracting… 14 subscriptions identified</ProgressLine>
              <ProgressLine running>Generating this week&apos;s alerts…</ProgressLine>
            </div>
          </div>
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
              them the way you would — bilingually, in the right currency, with
              the original email one click away.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-zinc-900/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:shadow-black/30"
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
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold dark:border-white/10 dark:bg-white/[0.03]">
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

        {/* Accuracy / trust */}
        <section
          id="accuracy"
          className="mx-auto w-full max-w-6xl px-6 py-20 sm:px-8 sm:py-28"
        >
          <div className="grid gap-10 rounded-3xl border border-zinc-200 bg-white p-8 dark:border-white/10 dark:bg-white/[0.02] sm:p-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Trust, but verify
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                We publish the AI&apos;s accuracy.
              </h2>
              <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400">
                Every extraction shows a confidence score and links back to the
                source email. We maintain an 80-row Traditional Chinese golden
                set across 15 services and publish per-field precision, recall,
                and F1 — versioned per prompt — on a public eval page.
              </p>
              <a
                href="/eval"
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
              >
                See latest eval
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="m13 5 7 7-7 7" />
                </svg>
              </a>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 dark:border-white/10 dark:bg-zinc-950/60">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Eval · prompt v0.4
                </p>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                  Passing
                </span>
              </div>
              <div className="mt-5 space-y-3">
                <Metric label="Service name" value={0.97} />
                <Metric label="Amount + currency" value={0.96} />
                <Metric label="Billing period" value={0.94} />
                <Metric label="Next billing date" value={0.91} />
                <Metric label="Category" value={0.89} />
              </div>
              <p className="mt-5 text-xs text-zinc-500">
                F1 across an 80-row Traditional Chinese golden set · 15
                services · updated each prompt revision
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section
          id="waitlist"
          className="mx-auto w-full max-w-6xl px-6 pb-24 sm:px-8 sm:pb-32"
        >
          <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-rose-500 p-10 text-white shadow-2xl shadow-indigo-500/20 sm:p-16 dark:border-white/10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_50%)]" />
            <div className="relative mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Stop guessing what you&apos;re paying for.
              </h2>
              <p className="mt-4 text-base text-white/80">
                Join the waitlist. We&apos;ll email when SubScribr opens up — no
                credit card, read-only Gmail access only.
              </p>
              <div className="mx-auto mt-8 flex w-full max-w-md flex-col items-center gap-3 sm:flex-row">
                <input
                  type="email"
                  placeholder="you@example.com"
                  aria-label="Email address"
                  className="h-12 w-full flex-1 rounded-full border border-white/20 bg-white/10 px-5 text-sm text-white placeholder:text-white/60 outline-none backdrop-blur transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                />
                <button
                  type="button"
                  className="h-12 w-full whitespace-nowrap rounded-full bg-white px-6 text-sm font-medium text-zinc-900 shadow-lg transition hover:bg-zinc-100 sm:w-auto"
                >
                  Reserve my spot
                </button>
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
            <a href="/eval" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
              Accuracy
            </a>
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

function AlertCard({
  priority,
  title,
  body,
  primary,
  secondary,
}: {
  priority: "high" | "medium" | "low";
  title: string;
  body: string;
  primary: string;
  secondary: string;
}) {
  const dot =
    priority === "high"
      ? "bg-rose-500"
      : priority === "medium"
        ? "bg-amber-500"
        : "bg-emerald-500";
  const ring =
    priority === "high"
      ? "ring-rose-500/20"
      : priority === "medium"
        ? "ring-amber-500/20"
        : "ring-emerald-500/20";
  return (
    <div
      className={`rounded-lg border border-zinc-200/70 bg-white p-3 ring-4 ${ring} dark:border-white/5 dark:bg-white/[0.03]`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <div className="flex-1">
          <p className="text-sm font-medium leading-snug">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{body}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="rounded-md bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {primary}
            </button>
            <button
              type="button"
              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-white/5"
            >
              {secondary}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  trend,
  trendColor,
}: {
  label: string;
  value: string;
  trend: string;
  trendColor: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200/70 bg-white px-3 py-3 dark:border-white/5 dark:bg-white/[0.03]">
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className={`text-[10px] font-medium ${trendColor}`}>{trend}</p>
    </div>
  );
}

function ProgressLine({
  done,
  running,
  children,
}: {
  done?: boolean;
  running?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      {done ? (
        <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
          ✓
        </span>
      ) : running ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-500 dark:border-zinc-700 dark:border-t-indigo-400" />
      ) : (
        <span className="h-4 w-4 rounded-full border border-zinc-300 dark:border-zinc-700" />
      )}
      <span className={done ? "text-zinc-500" : "text-zinc-900 dark:text-zinc-100"}>
        {children}
      </span>
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

function Metric({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
        <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
          F1 {value.toFixed(2)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ---------- Static content ---------- */

const iconClass = "h-5 w-5";

const features = [
  {
    title: "Gmail-native, read-only ingestion",
    body: "Connect via Google OAuth with read-only scope. SubScribr scans the past 90 days, dedupes by thread, and quietly indexes 30+ subscription senders without ever sending a single email itself.",
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
    body: "Claude reads mixed-language receipts with structured output: service, amount, currency, billing period, next charge date, category, and a confidence score for each one — handled in the same pass.",
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
    title: "This-week priority agent",
    body: "A single agent armed with tools — query subscriptions, fetch source email context, calculate trends, detect anomalies — produces priority-sorted 🔴🟡🟢 cards with cancel-ready reasoning, streamed live.",
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
    title: "Monthly narrative analysis",
    body: "Streaming top-3 changes, plain-language AI observations, and one or two concrete recommendations every month — built on the service knowledge module so price hikes and plan rules aren't a surprise.",
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
    title: "Source receipt, always one click away",
    body: "Every subscription expands to show the original email, the LLM's parsed JSON, and the confidence score. No black-box numbers — if Claude is wrong, you can see exactly where.",
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
    body: "Read-only Gmail scope. Encrypted at rest. Three-tier fallback so the dashboard never goes dark. SubScribr is on your side — not the side of the merchants charging you.",
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
    body: "Sign in with Google. Read-only scope, no scary permissions. We index the last 90 days for the demo and never write anything back.",
  },
  {
    title: "AI extracts your subscriptions",
    body: "Claude parses bilingual receipts with structured output, dedupes threads, and groups them by service with a visible confidence score.",
  },
  {
    title: "Read the weekly + monthly verdict",
    body: "An agent ranks renewals, surfaces zombies, and writes a plain-language monthly summary you can act on. Click any card to see the source email.",
  },
];
