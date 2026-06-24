const AVATAR_COLORS = [
  "#E11D48",
  "#DB2777",
  "#9333EA",
  "#6366F1",
  "#2563EB",
  "#0891B2",
  "#059669",
  "#65A30D",
  "#CA8A04",
  "#EA580C",
];

export function avatarInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

// Stable color per name so the same service always renders the same swatch.
export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function Avatar({ name }: { name: string }) {
  return (
    <span
      className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-lg text-sm font-bold text-white"
      style={{ backgroundColor: avatarColor(name) }}
    >
      {avatarInitial(name)}
    </span>
  );
}
