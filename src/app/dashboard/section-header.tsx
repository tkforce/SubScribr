import { ChevronDown, type LucideIcon } from "lucide-react";

// Shared heading for every top-level dashboard section.
//
// The sections deliberately do NOT share a container — the subscription list's
// rows are already `glass` cards, so wrapping them in another translucent panel
// would stack two blurs and blunt both. Consistency comes from the typographic
// rhythm instead: same icon size, same title weight, same right-aligned meta
// slot, at the same optical left edge as the content below.
//
// `toggle` is optional because collapsing is an affordance a section has to
// earn. Only the AI analysis does: it's tall, variable-height, and worth
// getting out of the way. The trend chart is a fixed 12rem, and the list is the
// page's primary content.
export function SectionHeader({
  icon: Icon,
  title,
  meta,
  toggle,
}: {
  icon: LucideIcon;
  title: string;
  meta?: React.ReactNode;
  toggle?: { open: boolean; onToggle: () => void; contentId: string };
}) {
  const label = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <h2 className="text-sm font-semibold">{title}</h2>
      {toggle && (
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
            toggle.open ? "" : "-rotate-90"
          }`}
          aria-hidden
        />
      )}
    </>
  );

  return (
    <div className="flex items-center justify-between gap-3">
      {toggle ? (
        // The negative margin cancels the button's own padding so the icon
        // lands on the same left edge as the plain variant.
        <button
          type="button"
          onClick={toggle.onToggle}
          aria-expanded={toggle.open}
          aria-controls={toggle.contentId}
          className="-ml-1 flex cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:text-foreground/80"
        >
          {label}
        </button>
      ) : (
        <div className="flex items-center gap-2">{label}</div>
      )}

      {meta && (
        <div className="text-xs text-muted-foreground">{meta}</div>
      )}
    </div>
  );
}
