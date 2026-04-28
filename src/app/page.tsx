import Link from "next/link";

export default function Home() {
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
            Sub<span className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">Scribr</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-zinc-600 dark:text-zinc-400 md:flex">
          <a href="#features" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
            Features
          </a>
          <a href="#how-it-works" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
            How it works
          </a>
          <a href="#pricing" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
            Pricing
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <a
            href="#waitlist"
            className="hidden text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 sm:inline"
          >
            Sign in
          </a>
          <a
            href="#waitlist"
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Get started
          </a>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-6 pt-16 pb-24 sm:px-8 sm:pt-24 sm:pb-32">
          <div className="flex flex-col items-center text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/60 px-3 py-1 text-xs font-medium text-zinc-600 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Coming soon · Private beta
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
              Every subscription, finally{" "}
              <span className="bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-rose-500 bg-clip-text text-transparent">
                under control
              </span>
              .
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              SubScribr quietly tracks every recurring charge, warns you before
              renewals, and surfaces the ones you forgot you were paying for —
              so you can stop leaking money you never agreed to spend.
            </p>
            <div className="mt-10 flex w-full max-w-md flex-col items-center gap-3 sm:flex-row">
              <input
                type="email"
                placeholder="you@example.com"
                aria-label="Email address"
                className="h-12 w-full flex-1 rounded-full border border-zinc-200 bg-white px-5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-white/20 dark:focus:ring-white/10"
              />
              <button
                type="button"
                className="h-12 w-full whitespace-nowrap rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-6 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40 sm:w-auto"
              >
                Join the waitlist
              </button>
            </div>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
              No credit card. We&apos;ll email when your spot opens.
            </p>
          </div>

          {/* Hero preview card */}
          <div className="relative mx-auto mt-20 max-w-4xl">
            <div className="rounded-2xl border border-zinc-200 bg-white/80 p-2 shadow-2xl shadow-zinc-900/10 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.03] dark:shadow-black/40">
              <div className="rounded-xl bg-zinc-50 p-6 dark:bg-zinc-950/60 sm:p-8">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      This month
                    </p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight">
                      $487.32
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Active
                    </p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight">
                      14
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Saved YTD
                    </p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight text-emerald-500">
                      $312
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { name: "Netflix", tag: "Streaming", price: "$15.99", color: "from-rose-500 to-red-600", initial: "N" },
                    { name: "Notion", tag: "Productivity", price: "$10.00", color: "from-zinc-700 to-zinc-900", initial: "N" },
                    { name: "Spotify Family", tag: "Music · Renews in 4 days", price: "$16.99", color: "from-emerald-500 to-green-600", initial: "S", warn: true },
                    { name: "Adobe Creative Cloud", tag: "Design", price: "$54.99", color: "from-fuchsia-500 to-purple-600", initial: "A" },
                  ].map((s) => (
                    <div
                      key={s.name}
                      className="flex items-center justify-between rounded-lg border border-zinc-200/70 bg-white px-4 py-3 dark:border-white/5 dark:bg-white/[0.03]"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br ${s.color} text-sm font-semibold text-white`}>
                          {s.initial}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{s.name}</p>
                          <p className="text-xs text-zinc-500">{s.tag}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
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
            <div className="pointer-events-none absolute -inset-x-8 -bottom-8 -z-10 h-32 bg-gradient-to-t from-white to-transparent dark:from-[#0a0a0f]" />
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
              The subscription dashboard your bank statement never gave you.
            </h2>
            <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400">
              A single view across every service, card, and currency — so the
              next surprise charge is the last surprise charge.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-zinc-900/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:shadow-black/30"
              >
                <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${f.color} text-white shadow-md`}>
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
              Three steps to a quieter wallet.
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

        {/* CTA */}
        <section
          id="waitlist"
          className="mx-auto w-full max-w-6xl px-6 pb-24 sm:px-8 sm:pb-32"
        >
          <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-rose-500 p-10 text-white shadow-2xl shadow-indigo-500/20 sm:p-16 dark:border-white/10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_50%)]" />
            <div className="relative mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Stop paying for subscriptions you forgot.
              </h2>
              <p className="mt-4 text-base text-white/80">
                Join the waitlist and we&apos;ll let you know the moment
                SubScribr opens up.
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

const iconClass = "h-5 w-5";

const features = [
  {
    title: "See every subscription at a glance",
    body: "One unified dashboard across streaming, SaaS, software, gym, and the random $4.99 charge from 2022. Group, filter, and sort however you think.",
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
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    title: "Renewal alerts before you get charged",
    body: "Quiet, well-timed reminders before the next renewal hits — with one-tap actions to keep, downgrade, or cancel.",
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
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10 21a2 2 0 0 0 4 0" />
      </svg>
    ),
  },
  {
    title: "Spot the zombies",
    body: "We surface subscriptions you haven't used in months and flag suspicious price hikes, so cancellation candidates rise to the top.",
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
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    ),
  },
  {
    title: "Real spending, not estimates",
    body: "Monthly, yearly, and projected lifetime cost across every currency you pay in — so you finally know what subscriptions actually cost you.",
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
    title: "Shared plans, shared sanity",
    body: "Split family or team subscriptions cleanly. Everyone sees what they pay, what they share, and who owes whom.",
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
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 20c0-3 3-5 6-5s6 2 6 5" />
        <path d="M15 20c0-2 2-3.5 4-3.5s2 1 2 1" />
      </svg>
    ),
  },
  {
    title: "Privacy-first by design",
    body: "Read-only connections, encrypted at rest, no selling your data. SubScribr is on your side — not the side of the merchants charging you.",
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
    title: "Connect once",
    body: "Link a card, an inbox, or just type in what you pay for. SubScribr handles the rest.",
  },
  {
    title: "We do the math",
    body: "Recurring charges are detected automatically and grouped into clean, human-readable subscriptions.",
  },
  {
    title: "You stay in control",
    body: "Get renewal alerts, cancel-ready insights, and a clear monthly picture — without the spreadsheet.",
  },
];
