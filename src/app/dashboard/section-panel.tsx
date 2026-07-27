import type { LucideIcon } from "lucide-react";
import { SectionHeader } from "./section-header";

// A glass panel with a SectionHeader on top — the container every top-level
// dashboard section uses, so consistency is structural rather than eyeballed.
//
// This includes the subscription list, whose rows are themselves `glass` cards.
// An earlier version of this comment claimed nesting glass inside glass stacks
// two blurs and blunts both, so the list should stay bare — but the analysis
// section has always rendered `glass bg-card/50` insight cards inside this same
// panel and reads fine. The list looked inconsistent precisely because it was
// the one section left without a panel.
//
// Deliberately stateless and free of "use client", so a server component can
// use it without pushing its subtree into the client bundle. `icon` is a
// component reference, which is not serializable across the server→client
// boundary — owning the collapse state here would have forced every caller to
// be a client component.
//
// Collapsing is therefore opt-in *and* caller-owned: pass `toggle` and hold the
// `useState` yourself. Only the AI analysis does — it's tall, variable-height,
// and worth getting out of the way.
export function SectionPanel({
  icon,
  title,
  meta,
  notice,
  toggle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  meta?: React.ReactNode;
  // Rendered between header and content, and stays visible while collapsed —
  // an error the user needs to see shouldn't be hidden behind a chevron.
  notice?: React.ReactNode;
  toggle?: { open: boolean; onToggle: () => void; contentId: string };
  children: React.ReactNode;
}) {
  const isOpen = !toggle || toggle.open;

  // `bg-card/25` rather than a full `bg-card`: the panel is a backdrop, and the
  // cards inside it sit at `bg-card/50`. Keeping the container lighter than its
  // contents is what makes the two levels read as hierarchy — when both were
  // pushed the same "raised" direction they just read as overlapping sheets.
  // Anything at or above the inner /50 merges the layers back together.
  return (
    <section className="glass mt-6 rounded-2xl bg-card/25 px-5 py-4">
      <SectionHeader
        icon={icon}
        title={title}
        meta={meta}
        toggle={toggle}
      />

      {notice}

      {isOpen && (
        <div id={toggle?.contentId} className="mt-4">
          {children}
        </div>
      )}
    </section>
  );
}
