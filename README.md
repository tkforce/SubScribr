# SubScribr

Finds the subscriptions hiding in your Gmail, and tells you which ones deserve
a second look.

SubScribr reads billing-related email, extracts the facts with an LLM, folds
them into a current picture of what you pay for, and runs a tool-using agent
over the result to surface what actually changed this month. It is a
**decision-first** dashboard, not a chatbot — there is no chat box anywhere in
the product, by design.

> **Status:** working end-to-end, single-user. Built as a portfolio project to
> practise production LLM engineering — evals, tool use, streaming, and the
> boundary between what a model should decide and what code should decide.

---

## What it does

1. **Ingest** — pulls candidate email with a Gmail server-side `q=` filter, then
   a ~30-line blacklist drops the obvious noise (calendar invites, password
   resets).
2. **Extract** — one LLM call per email, in parallel, returning a Zod-validated
   structured object. The model decides `isSubscriptionRelated` itself; a
   `false` is logged and dropped, never stored.
3. **Derive** — extractions become immutable `BillingEvent` rows. Current
   subscription state is *replayed from scratch* off that log, never mutated
   in place.
4. **Analyse** — a single agent with four tools writes up what's worth knowing,
   streamed to the browser over SSE, then constrained into a renderable shape
   by a second structured-output pass.

**Privacy:** email bodies exist in memory for the duration of one extraction
call and are never written to disk or database. What persists is the minimum
needed to deduplicate and order events — a message id and a timestamp.

---

## Design decisions worth arguing about

These are the parts I'd want to be asked about.

**The event log is the only source of truth.** `BillingEvent` is append-only.
`Subscription` and `Analysis` are both derived views over it. Deriving state is
a pure fold over sorted events, which buys three things: out-of-order arrival
can't corrupt state, the fold is unit-testable against synthetic sequences
without touching a database, and fixing a bug in the derive logic is *code plus
one re-sync* rather than code plus a backfill migration.

**The LLM understands; code maps.** The model reads prose and decides what a
message means. Turning `"Cursor Pro (Annual)"` into a canonical id is exact
alias matching plus a slugify fallback — deliberately *not* fuzzy matching,
which fails silently and is miserable to debug.

**No confidence score.** Every decision that a confidence threshold would have
gated is already expressed structurally in the schema, so storing a number
nobody reads would have been theatre.

**One analysis section, not two.** The original plan had "needs attention" and
"this month" as separate agent runs. Built both, ran them, and they queried the
same log through the same tools and said the same things twice at double the
cost. Merging them into one ranked list makes the duplication *structurally
impossible* rather than something a prompt politely asks the model to avoid.

**No dismiss / snooze buttons on AI cards.** An LLM insight has no stable
identity across runs — dismiss it and next week it reappears with different
wording. Things without stable identity don't get a lifecycle.

**Token cost scales with step count, not tool-call count**, because every step
resends the whole conversation. The same data fetched as one batched round is
~2 steps / 15k tokens; fetched one service at a time it hits the 8-step ceiling
at ~46k. The fix was batching, not a higher limit.

**Every prompt guardrail came from a real bad output.** They're tabulated in
[`desing_v8.md`](./desing_v8.md) with the failure that motivated each one.

---

## Stack

Next.js 16 (App Router) · TypeScript · Prisma 7 + Postgres · NextAuth + Google
OAuth · Vercel AI SDK v5 · Gemini · Tailwind + base-ui · Recharts · Vitest

The LLM is behind a single swap point in [`src/lib/llm.ts`](./src/lib/llm.ts).

---

## Getting started

Requires Node 20+, a Postgres database (Supabase works well), a Google Cloud
OAuth client with the `gmail.readonly` scope, and a Gemini API key.

```bash
npm install
cp .env.example .env.local   # then fill it in — every variable is documented there
npm run db:migrate
npm run dev
```

Note that config is read from `.env.local` specifically, not `.env`:
`prisma.config.ts` and the scripts load that filename explicitly.

### Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Vitest — the pure logic (derive, normalize, eval, SSE parsing) is covered |
| `npm run eval` | Score the current prompt against the frozen golden set |
| `npm run inspect:extractions` | Run extraction over a mailbox and dump results for review |
| `npm run golden:draft` | Build/refresh the golden-set draft, preserving reviewed labels |
| `npm run agent:test` | Exercise the agent's tools from the CLI |
| `npm run db:studio` | Prisma Studio |

---

## The eval harness

Prompt changes are scored, not eyeballed. A frozen human-arbitrated golden set
gives precision / recall / F1 on the `isSubscriptionRelated` gate plus
per-field accuracy on everything extracted; every prompt version and its
numbers are logged in
[`docs/extractions/PROMPT_LOG.md`](./docs/extractions/PROMPT_LOG.md).

Latest recorded run — same fixtures, same model, temperature 0:

| Metric | Score |
| --- | --- |
| `isSubscriptionRelated` P / R / F1 | 0.90 / 0.90 / 0.90 |
| `amount` / `currency` / `cycle` | 1.00 |
| `emailSignalType` | 1.00 |
| `category` | 0.78 |
| `rawServiceName` | 0.67 |

One result the harness settled definitively: rewriting the instructions from
Traditional Chinese to English changed *nothing* — same false positive, same
false negative, same field mismatches. Instruction language is not a factor for
this task.

The golden set and all inspection dumps contain personal email content and are
gitignored. [`docs/extractions/README.md`](./docs/extractions/README.md)
explains how to build your own.

---

## Not built (on purpose)

Chat UI · multi-user · multi-agent · a vector DB (the knowledge base is ~30KB
of typed TypeScript — RAG would be ceremony) · trial tracking (unpaid isn't a
subscription, and half-supporting it produced fields that could never be
correct) · scheduled analysis · storing email bodies.

Still open: subscription editing UI, the three-tier agent fallback, and
alias backfill for service normalization. Tracked in
[`desing_v8.md`](./desing_v8.md) Part 9.

---

## Design docs

`desing_v6.md` → `desing_v7.md` → `desing_v8.md` are the successive full plans,
in Traditional Chinese. Each opens with a diff against the previous version, so
the reasoning behind every reversal is on the record — including the one where
a table that had already been migrated into production got deleted.

## License

MIT — see [LICENSE](./LICENSE).
