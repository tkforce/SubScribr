"use client";

import { useId, useState } from "react";
import { SectionHeader } from "./section-header";

// A glass panel with a SectionHeader on top — the container every top-level
// dashboard section uses, so consistency is structural rather than eyeballed.
//
// This includes the subscription list, whose rows are themselves `glass` cards.
// Nesting works because the panel is deliberately lighter than what it holds
// (bg-card/25 vs the rows' bg-card/50); it was only when both layers sat at the
// same weight that the two levels read as overlap instead of hierarchy.
//
// Client component because it owns the collapse state. `children` still render
// on the server and pass through as RSC payload, so a server-component caller
// like SubscriptionList keeps its subtree off the client bundle.
export function SectionPanel({
  icon,
  title,
  meta,
  notice,
  defaultOpen = true,
  children,
}: {
  // A rendered element, not a component reference — see SectionHeader.
  icon: React.ReactNode;
  title: string;
  meta?: React.ReactNode;
  // Rendered between header and content, and stays visible while collapsed —
  // an error the user needs to see shouldn't be hidden behind a chevron.
  notice?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  // Vertical padding only: px stays at 5 so section content keeps its left
  // edge aligned with the stat tiles above, which use the same px-5.
  return (
    <section className="glass mt-6 rounded-2xl bg-card/25 px-5 py-5">
      <SectionHeader
        icon={icon}
        title={title}
        meta={meta}
        toggle={{ open, onToggle: () => setOpen((v) => !v), contentId }}
      />

      {notice}

      {/* Height animation via grid-template-rows 0fr -> 1fr. The alternatives
          are worse: transitioning `height: auto` needs interpolate-size, which
          isn't universally supported yet, and measuring scrollHeight in an
          effect means a layout read on every toggle. This is pure CSS and the
          content stays in flow, so it works at any height without measuring.

          The content stays mounted while collapsed rather than unmounting, so
          the transition has something to animate — `inert` keeps it out of the
          tab order and the accessibility tree meanwhile. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        {/* Horizontal breathing room for the rows' shadows: `overflow-hidden`
            clips at this element's padding edge, so without it the side
            shadows were sliced off flat. The negative margin cancels the
            padding, so rows keep their original left/right alignment.
            Vertical clearance can't go here — padding on the clipping box
            survives the 0fr track and would leave a gap under a collapsed
            section — so it lives on the content div below instead. */}
        <div className="-mx-2 overflow-hidden px-2">
          {/* Padding rather than margin: a margin would escape the clipped
              track and leave a gap under a collapsed section. `pb` is the
              bottom row's shadow clearance (~4.5px of reach), which used to
              land outside the clip box and get cut flat. */}
          <div id={contentId} className="pt-5 pb-1.5" inert={!open}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
