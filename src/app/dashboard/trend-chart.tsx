"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyTrendPoint } from "@/lib/monthly-trend";

export function TrendChart({ points }: { points: MonthlyTrendPoint[] }) {
  // Spec: hide the whole card when there is no countable billing spend at all.
  if (!points.some((p) => p.totalTwd > 0)) return null;

  const data = points.map((p) => ({
    ...p,
    label: `${Number(p.month.slice(5))}月`,
  }));

  return (
    <div className="mt-6 rounded-xl border bg-card/40 px-5 py-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        月支出趨勢（攤平）
      </div>
      <div className="mt-3 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.15} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={12}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={12}
              width={64}
              tickFormatter={(v: number) => v.toLocaleString()}
            />
            <Tooltip
              cursor={{ fillOpacity: 0.06 }}
              formatter={(value) => [
                `NT$ ${Math.round(Number(value)).toLocaleString()}`,
                "攤平支出",
              ]}
            />
            <Bar dataKey="totalTwd" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell
                  key={d.month}
                  fill="var(--primary)"
                  fillOpacity={i === data.length - 1 ? 0.9 : 0.3}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
