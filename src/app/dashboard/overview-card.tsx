export function OverviewCard({
  totalMonthlyTwd,
  activeCount,
}: {
  totalMonthlyTwd: number;
  activeCount: number;
}) {
  return (
    <div className="rounded-xl border bg-card/40 px-5 py-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        本月總支出
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">
        NT$ {totalMonthlyTwd.toLocaleString()}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {activeCount} 個有效訂閱
      </div>
    </div>
  );
}
