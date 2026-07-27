// Color usado para avatares/dots cuando el dato no trae un color propio en la DB.
export const DEFAULT_ACCENT_COLOR = "var(--accent)";

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

export function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", { month: "short", year: "numeric" }).format(date).replace(".", "");
}

export function formatDayMonth(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short" }).format(date).replace(".", "");
}

export function formatDayMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric" }).format(date).replace(".", "");
}

export function formatWeekdayDayMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date).replace(/\./g, "");
}
