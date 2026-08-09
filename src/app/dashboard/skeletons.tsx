import { BarChart3, CreditCard } from "lucide-react";
import { SectionPanel } from "./section-panel";

// Placeholders shaped like the real content so a sync that lands mid-scroll
// doesn't reflow the page under the reader — the same approach AnalysisSkeleton
// already takes inside the analysis section.

function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-muted-foreground/15 ${className}`} />;
}

export function StatRowSkeleton() {
  return (
    <div className="grid animate-pulse grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="glass rounded-2xl bg-card/25 px-5 py-4">
          <Bar className="h-2.5 w-16" />
          <Bar className="mt-3 h-6 w-24" />
          <Bar className="mt-2.5 h-2.5 w-20" />
        </div>
      ))}
    </div>
  );
}

export function TrendChartSkeleton() {
  return (
    <SectionPanel icon={<BarChart3 />} title="Monthly spend">
      <div className="h-[220px] animate-pulse rounded-xl bg-muted-foreground/10" aria-hidden />
    </SectionPanel>
  );
}

export function SubscriptionListSkeleton() {
  return (
    <SectionPanel icon={<CreditCard />} title="Subscriptions">
      <ul className="flex animate-pulse flex-col gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="glass-row flex items-center gap-3.5 rounded-xl bg-card/50 px-4 py-3"
          >
            <div className="h-[34px] w-[34px] shrink-0 rounded-full bg-muted-foreground/15" />
            <div className="min-w-0 flex-1">
              <Bar className="h-3.5 w-32" />
              <Bar className="mt-2 h-3 w-16" />
            </div>
            <Bar className="h-3.5 w-20" />
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}
