import type { MonthDelta } from "@/lib/monthly-trend";

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
  return (
    <div className="glass rounded-2xl bg-card px-5 py-4">
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
            ? "上月無資料可比（帳單攤平）"
            : `較上月 ${delta.pctChange >= 0 ? "+" : "-"}${Math.abs(Math.round(delta.pctChange * 100))}%（帳單攤平）`,
        valueClassName:
          delta.deltaTwd >= 0
            ? "text-red-600 dark:text-red-400"
            : "text-emerald-600 dark:text-emerald-400",
      }
    : { value: "—", sub: "尚無足夠帳單資料", valueClassName: "" };

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        label="本月總支出"
        value={formatTwd(totalMonthlyTwd)}
        sub="依訂閱週期攤平為每月"
      />
      <Stat
        label="vs 上月"
        value={deltaStat.value}
        sub={deltaStat.sub}
        valueClassName={deltaStat.valueClassName}
      />
      <Stat label="有效訂閱" value={`${activeCount}`} sub="個服務" />
      <Stat
        label="年化支出"
        value={formatTwd(totalMonthlyTwd * 12)}
        sub="以目前訂閱推估"
      />
    </div>
  );
}
