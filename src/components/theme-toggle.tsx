"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

// Theme state lives outside React: the <html> class list (written by the
// pre-paint script in layout.tsx and by toggleTheme) plus the OS preference.
// useSyncExternalStore reads it without setState-in-effect.
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => {
    listeners.delete(callback);
    mq.removeEventListener("change", callback);
  };
}

function getSnapshot(): Theme {
  const cls = document.documentElement.classList;
  if (cls.contains("dark")) return "dark";
  if (cls.contains("light")) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

// Server render (and first hydration pass) assumes light; the client snapshot
// corrects it right after hydration.
function getServerSnapshot(): Theme {
  return "light";
}

function toggleTheme(current: Theme) {
  const next: Theme = current === "dark" ? "light" : "dark";
  const cls = document.documentElement.classList;
  cls.remove("dark", "light");
  cls.add(next);
  try {
    localStorage.setItem("theme", next);
  } catch {}
  emit();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <button
      type="button"
      onClick={() => toggleTheme(theme)}
      aria-label={theme === "dark" ? "切換為淺色模式" : "切換為深色模式"}
      className="glass inline-flex size-9 items-center justify-center rounded-full bg-card/60 text-muted-foreground transition-colors hover:text-foreground"
    >
      {theme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </button>
  );
}
