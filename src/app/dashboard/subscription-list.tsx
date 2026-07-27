import { CreditCard } from "lucide-react";
import { Avatar } from "./avatar";
import { SectionPanel } from "./section-panel";
import { upcomingBilling, type SubscriptionView } from "@/lib/queries/subscriptions";

const CYCLE_LABEL: Record<string, string> = {
  monthly: "月繳",
  yearly: "年繳",
  quarterly: "季繳",
  "one-time": "一次性",
};

const CATEGORY_LABEL: Record<string, string> = {
  entertainment: "娛樂",
  productivity: "生產力",
  ai: "AI",
  cloud: "雲端",
  comm: "通訊",
  other: "其他",
};

// Tinted pill per category; label text carries identity, color is reinforcement.
const CATEGORY_BADGE: Record<string, string> = {
  entertainment: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  productivity:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  ai: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  cloud: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  comm: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
};

function formatAmount(currency: string, amount: number): string {
  if (currency === "TWD") return `NT$ ${Math.round(amount).toLocaleString()}`;
  const symbol =
    currency === "USD"
      ? "US$"
      : currency === "JPY"
        ? "¥"
        : currency === "EUR"
          ? "€"
          : `${currency} `;
  return `${symbol}${amount.toLocaleString()}`;
}

function formatNextBilling(d: Date | null): string {
  if (!d) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const GRID = "grid grid-cols-[34px_1.6fr_1fr_0.8fr_1fr] items-center gap-3.5";

export function SubscriptionList({
  subscriptions,
  now,
}: {
  subscriptions: SubscriptionView[];
  now: Date;
}) {
  // Not collapsible: this is the page's primary content, and hiding it behind a
  // chevron would also dilute the one section where collapsing is meaningful.
  return (
    <SectionPanel
      icon={<CreditCard />}
      title="訂閱明細"
      meta={
        subscriptions.length > 0 ? `${subscriptions.length} 個服務` : undefined
      }
    >
      {subscriptions.length === 0 ? (
        // Muted one-liner, matching the analysis section's empty state rather
        // than the full-width dashed box this used when the list sat directly
        // on the page background.
        <p className="text-xs text-muted-foreground">
          目前沒有訂閱資料。點下方的「Ingest」掃描 Gmail，或前往 /dev 重新掃描。
        </p>
      ) : (
        <>
          <div
            className={`${GRID} px-4 pb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/60`}
          >
            <span />
            <span>服務</span>
            <span>金額</span>
            <span>週期</span>
            <span className="text-right">下次扣款</span>
          </div>
          <ul className="flex flex-col gap-2">
            {subscriptions.map((s) => {
              const name = s.displayName ?? s.serviceName;
              const upcoming = upcomingBilling(s.nextBillingDate, now);
              return (
                <li
                  key={s.id}
                  className={`${GRID} glass-row rounded-xl bg-card/50 px-4 py-3 transition-colors hover:bg-card/90`}
                >
                  <Avatar name={name} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{name}</span>
                    </div>
                    <span
                      className={`mt-0.5 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_BADGE[s.category] ?? CATEGORY_BADGE.other}`}
                    >
                      {CATEGORY_LABEL[s.category] ?? s.category}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold tabular-nums">
                      {formatAmount(s.currency, s.amount)}
                    </div>
                    {s.currency !== "TWD" && (
                      <div className="text-[11px] text-muted-foreground">
                        NT$ {Math.round(s.amountInTwd).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {CYCLE_LABEL[s.cycle] ?? s.cycle}
                  </span>
                  <span className="text-right text-xs">
                    {upcoming ? (
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {formatNextBilling(s.nextBillingDate)} · {upcoming.label}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {formatNextBilling(s.nextBillingDate)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </SectionPanel>
  );
}
