import type { MonthDelta } from "@/lib/queries/monthly-trend";

function formatTwd(n: number): string {
  return `NT$ ${Math.round(n).toLocaleString()}`;
}

function Stat({
  label,
  value,
  sub,
  valueClassName = "",
}: {
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
}) {
  // Same weight as SectionPanel: both sit directly on the page background, so
  // they're the same level of the hierarchy. `bg-card/50` is reserved for what
  // sits *inside* one of these surfaces (insight cards, subscription rows).
  return (
    <div className="glass rounded-2xl bg-card/25 px-5 py-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1.5 text-2xl font-semibold tabular-nums ${valueClassName}`}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

export function StatRow({
  totalMonthlyTwd,
  activeCount,
  delta,
}: {
  totalMonthlyTwd: number;
  activeCount: number;
  delta: MonthDelta | null;
}) {
  // Spend going up is the bad direction on a spending dashboard.
  const deltaStat = delta
    ? {
        value: `${delta.deltaTwd >= 0 ? "↑" : "↓"} ${formatTwd(Math.abs(delta.deltaTwd))}`,
        sub:
          delta.pctChange === null
            ? "No comparable data last month"
            : `${delta.pctChange >= 0 ? "+" : "-"}${Math.abs(Math.round(delta.pctChange * 100))}% vs last month`,
        valueClassName:
          delta.deltaTwd >= 0
            ? "text-red-600 dark:text-red-400"
            : "text-emerald-600 dark:text-emerald-400",
      }
    : { value: "—", sub: "Not enough billing history", valueClassName: "" };

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        label="This month"
        value={formatTwd(totalMonthlyTwd)}
        sub="Normalized to a monthly figure"
      />
      <Stat
        label="vs last month"
        value={deltaStat.value}
        sub={deltaStat.sub}
        valueClassName={deltaStat.valueClassName}
      />
      <Stat
        label="Active"
        value={`${activeCount}`}
        sub={activeCount === 1 ? "service" : "services"}
      />
      <Stat
        label="Annualized"
        value={formatTwd(totalMonthlyTwd * 12)}
        sub="Projected from current subscriptions"
      />
    </div>
  );
}
