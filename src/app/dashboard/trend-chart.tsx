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
import { BarChart3 } from "lucide-react";
import type { MonthlyTrendPoint } from "@/lib/queries/monthly-trend";
import { SectionPanel } from "./section-panel";

export function TrendChart({ points }: { points: MonthlyTrendPoint[] }) {
  // Spec: hide the whole card when there is no countable billing spend at all.
  if (!points.some((p) => p.totalTwd > 0)) return null;

  const data = points.map((p) => ({
    ...p,
    label: `${Number(p.month.slice(5))}月`,
  }));

  return (
    <SectionPanel
      icon={<BarChart3 />}
      title="月支出趨勢"
      meta={`最近 ${data.length} 個月 · 依週期攤平`}
    >
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              {/* Quieter take on the landing's brand gradient
                  (Tailwind indigo-500 → violet-500 instead of fuchsia). */}
              <linearGradient id="trendBarFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.585 0.233 277.117)" />
                <stop offset="100%" stopColor="oklch(0.606 0.25 292.717)" />
              </linearGradient>
            </defs>
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
            <Bar dataKey="totalTwd" radius={[6, 6, 0, 0]}>
              {data.map((d, i) => (
                <Cell
                  key={d.month}
                  fill="url(#trendBarFill)"
                  fillOpacity={i === data.length - 1 ? 1 : 0.35}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionPanel>
  );
}
