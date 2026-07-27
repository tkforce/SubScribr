import { ChevronDown } from "lucide-react";

// Shared heading for every top-level dashboard section.
//
// Consistency comes from the typographic rhythm: same icon size, same title
// weight, same right-aligned meta slot, at the same optical left edge as the
// content below.
//
// `icon` is a rendered element rather than a component reference so that server
// components can pass one across the boundary to SectionPanel, which is a
// client component because it owns the collapse state. Callers pass a bare
// `<CreditCard />`; the sizing and colour stay here, applied to whatever svg
// lands inside, so the styling can't drift between sections.
export function SectionHeader({
  icon,
  title,
  meta,
  toggle,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: React.ReactNode;
  toggle?: { open: boolean; onToggle: () => void; contentId: string };
}) {
  const label = (
    <>
      <span
        className="[&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-primary"
        aria-hidden
      >
        {icon}
      </span>
      <h2 className="text-sm font-semibold">{title}</h2>
      {toggle && (
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 ease-out motion-reduce:transition-none ${
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

      {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
    </div>
  );
}
