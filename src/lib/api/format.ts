// Color usado para avatares/dots cuando el dato no trae un color propio en la DB.
export const DEFAULT_ACCENT_COLOR = "var(--accent)";

/** Minúsculas y sin tildes, para que "gestion" encuentre "Gestión". */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

// `timeZone: "UTC"` para las fechas sin hora que se guardan a medianoche UTC (inicio de un
// proyecto, fecha de un acta): sin ella se leen en la zona del proceso, y en Chile caen un día antes.
export function formatMonthYear(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("es-CL", { month: "short", year: "numeric", timeZone }).format(date).replace(".", "");
}

export function formatDayMonth(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone }).format(date).replace(".", "");
}

export function formatDayMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric" }).format(date).replace(".", "");
}

// Un instante (no una fecha de calendario), mostrado en hora de Chile para que servidor y
// navegador escriban lo mismo. Es la misma zona que CALENDAR_TIME_ZONE; no se importa de
// src/lib/calendar.ts porque ese módulo ya importa este.
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Santiago",
  }).format(date).replace(".", "");
}

export function formatWeekdayDayMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date).replace(/\./g, "");
}

// Una fecha de calendario en la hora local del proceso: para el navegador ("hoy" en un
// formulario, las vistas del calendario). Usar Date#toISOString()/new Date(string) aquí
// la corrompería en zonas con offset negativo ("2026-06-01" se lee como medianoche UTC,
// que en Chile cae el 31 de mayo).
// Lo que se guarda en la base como fecha sin hora (medianoche UTC) no pasa por aquí: el
// servidor lo lee y escribe con dateToDayKey / dayKeyToDate (src/lib/tiempo.ts), que no
// dependen de la zona horaria del proceso.
export function toISODateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseISODateInput(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
