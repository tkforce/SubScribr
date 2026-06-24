import { Badge } from "@/components/ui/badge";
import { Avatar } from "./avatar";
import type { SubscriptionView } from "@/lib/subscriptions";

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
}: {
  subscriptions: SubscriptionView[];
}) {
  if (subscriptions.length === 0) {
    return (
      <p className="mt-8 rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        目前沒有訂閱資料。點下方的「Ingest」掃描 Gmail，或前往 /dev 重新掃描。
      </p>
    );
  }

  return (
    <div className="mt-6">
      <div
        className={`${GRID} px-3.5 pb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/60`}
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
          return (
            <li
              key={s.id}
              className={`${GRID} rounded-lg border bg-card/40 px-3.5 py-2.5 transition-colors hover:bg-muted/50`}
            >
              <Avatar name={name} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{name}</span>
                  {s.isTrial && <Badge variant="secondary">試用</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
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
              <span className="text-right text-xs text-muted-foreground">
                {formatNextBilling(s.nextBillingDate)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
