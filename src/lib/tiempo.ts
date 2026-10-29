import type { TimeEntryKind } from "@/generated/prisma/enums";
import {
  CALENDAR_TIME_ZONE,
  WEEKDAY_SHORT,
  addDays,
  isDayKey,
  parseDayKey,
  startOfWeek,
  toDayKey,
  todayInZone,
  weekTitle,
} from "@/lib/calendar";

// Lógica de StandUp y registro de horas, sin React ni Prisma.
//
// Las semanas van de lunes a domingo en America/Santiago, igual que el "hoy" del
// calendario. En la base, Standup.weekStart y TimeEntry.date son fechas sin hora
// a medianoche UTC; en la API y en el cliente viajan como claves "YYYY-MM-DD".

/** Duración mínima de un registro y paso de las horas. */
export const MINUTES_STEP = 15;
export const MAX_ENTRY_MINUTES = 24 * 60;
export const MAX_DESCRIPTION_LENGTH = 300;
export const MAX_STANDUP_LENGTH = 2000;

/** Tope del historial sin filtro de semana. */
export const MAX_HISTORY_ENTRIES = 200;

/** Semanas que ofrece el filtro del historial, contando la actual. */
export const HISTORY_WEEKS = 12;

/** Proyectos con color propio en el gráfico; del sexto en adelante se juntan en "Otros". */
export const MAX_CHART_SERIES = 6;
export const OTHER_SERIES_KEY = "__otros__";

// ─── Semanas ───

/** Lunes de la semana de `dayKey`. */
export function weekStartOf(dayKey: string): string {
  return toDayKey(startOfWeek(parseDayKey(dayKey)));
}

export function isWeekStart(value: unknown): value is string {
  return isDayKey(value) && weekStartOf(value) === value;
}

export function todayKey(now: Date = new Date()): string {
  return todayInZone(CALENDAR_TIME_ZONE, now);
}

/** Lunes de la semana en curso en Chile. */
export function currentWeekStart(now: Date = new Date()): string {
  return weekStartOf(todayKey(now));
}

export function shiftWeek(weekStart: string, weeks: number): string {
  return toDayKey(addDays(parseDayKey(weekStart), weeks * 7));
}

/** Las `count` semanas que terminan en `weekStart`, de la más reciente a la más antigua. */
export function recentWeeks(weekStart: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftWeek(weekStart, -i));
}

export function weekDays(weekStart: string): string[] {
  const start = parseDayKey(weekStart);
  return Array.from({ length: 7 }, (_, i) => toDayKey(addDays(start, i)));
}

/** "12 – 18 oct 2026" */
export function formatWeek(weekStart: string): string {
  return weekTitle(parseDayKey(weekStart));
}

/** "Lun 13 oct" */
export function formatEntryDate(dayKey: string): string {
  const date = parseDayKey(dayKey);
  const month = new Intl.DateTimeFormat("es-CL", { month: "short" }).format(date).replace(".", "");
  return `${WEEKDAY_SHORT[(date.getDay() + 6) % 7]} ${date.getDate()} ${month}`;
}

// ─── Fechas en la base ───

export function dayKeyToDate(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

export function dateToDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ─── Horas ───

/** "2.5h", "3h", "0.75h" */
export function formatHours(minutes: number): string {
  return `${Number((minutes / 60).toFixed(2))}h`;
}

export function isValidEntryMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MINUTES_STEP &&
    value <= MAX_ENTRY_MINUTES &&
    value % MINUTES_STEP === 0
  );
}

/** Horas escritas en el formulario ("2.5" o "2,5") a minutos, o null si no son un múltiplo válido de 15 min. */
export function hoursInputToMinutes(value: string): number | null {
  const hours = Number(value.trim().replace(",", "."));
  if (!value.trim() || !Number.isFinite(hours)) return null;
  const minutes = Math.round(hours * 60);
  return isValidEntryMinutes(minutes) ? minutes : null;
}

export function minutesToHoursInput(minutes: number): string {
  return String(Number((minutes / 60).toFixed(2)));
}

/**
 * Marcador del historial para las horas que salen de mover una tarea ("T-03 · trabajo");
 * un registro manual no lleva.
 */
export const timeEntryKindLabel: Record<TimeEntryKind, string | null> = {
  MANUAL: null,
  TRABAJO: "trabajo",
  REVISION: "revisión",
};

// ─── Gráfico semanal ───

export interface ChartEntry {
  date: string;
  minutes: number;
  project: { id: string; name: string };
}

export interface ChartSeries {
  /** Id del proyecto, u OTHER_SERIES_KEY. */
  key: string;
  name: string;
  /** 1..MAX_CHART_SERIES para los proyectos; null para "Otros", que va en gris. */
  slot: number | null;
  minutes: number;
}

export interface ChartDay {
  dayKey: string;
  /** "Lun 13" */
  label: string;
  totalMinutes: number;
  /** De abajo hacia arriba, en el orden de la leyenda. Solo series con horas ese día. */
  segments: { key: string; minutes: number }[];
}

export interface WeekChart {
  series: ChartSeries[];
  days: ChartDay[];
  totalMinutes: number;
  /** Tope del eje en horas; múltiplo de `tickStep`. */
  axisMaxHours: number;
  /** Marcas del eje en horas, de 0 a axisMaxHours. */
  ticks: number[];
}

const TICK_STEPS = [1, 2, 4, 6, 8, 12];

function axisFor(maxMinutes: number): { axisMaxHours: number; ticks: number[] } {
  const maxHours = Math.max(maxMinutes / 60, 1);
  // El paso más chico que deja como mucho 4 tramos.
  const step = TICK_STEPS.find((s) => maxHours / s <= 4) ?? 12;
  const axisMaxHours = Math.ceil(maxHours / step) * step;
  const ticks = Array.from({ length: axisMaxHours / step + 1 }, (_, i) => i * step);
  return { axisMaxHours, ticks };
}

/** Color CSS de una serie: `--series-N`, o gris para "Otros". */
export function seriesColor(series: Pick<ChartSeries, "slot">): string {
  return series.slot === null ? "var(--series-other)" : `var(--series-${series.slot})`;
}

/**
 * Suma los minutos por proyecto y les asigna color. Los colores se asignan por
 * nombre de proyecto (orden alfabético), no por cuántas horas tiene, para que
 * registrar horas no repinte los demás. Si hay más de MAX_CHART_SERIES
 * proyectos, los de menos horas se juntan en "Otros". `seriesKey` dice en qué
 * serie cae cada proyecto. La usan el gráfico de /tiempo y las analíticas.
 */
export function assignProjectSeries(entries: Pick<ChartEntry, "minutes" | "project">[]): {
  series: ChartSeries[];
  seriesKey: (projectId: string) => string;
} {
  const totals = new Map<string, { name: string; minutes: number }>();
  for (const e of entries) {
    const current = totals.get(e.project.id) ?? { name: e.project.name, minutes: 0 };
    current.minutes += e.minutes;
    totals.set(e.project.id, current);
  }

  const byMinutes = [...totals.entries()].sort((a, b) => b[1].minutes - a[1].minutes || a[1].name.localeCompare(b[1].name, "es"));
  const overflow = byMinutes.length > MAX_CHART_SERIES;
  const kept = overflow ? byMinutes.slice(0, MAX_CHART_SERIES - 1) : byMinutes;
  const folded = new Set(overflow ? byMinutes.slice(MAX_CHART_SERIES - 1).map(([id]) => id) : []);

  const series: ChartSeries[] = kept
    .sort((a, b) => a[1].name.localeCompare(b[1].name, "es"))
    .map(([id, t], i) => ({ key: id, name: t.name, slot: i + 1, minutes: t.minutes }));
  if (overflow) {
    const minutes = byMinutes.filter(([id]) => folded.has(id)).reduce((sum, [, t]) => sum + t.minutes, 0);
    series.push({ key: OTHER_SERIES_KEY, name: "Otros", slot: null, minutes });
  }

  return { series, seriesKey: (projectId) => (folded.has(projectId) ? OTHER_SERIES_KEY : projectId) };
}

/**
 * Horas por día y proyecto de la semana que empieza en `weekStart`. Los colores
 * se asignan por nombre de proyecto, no por cuántas horas tiene, para que
 * registrar horas no repinte los demás. Si hay más de MAX_CHART_SERIES
 * proyectos, los de menos horas se juntan en "Otros".
 */
export function buildWeekChart(entries: ChartEntry[], weekStart: string): WeekChart {
  const days = weekDays(weekStart);
  const inWeek = entries.filter((e) => days.includes(e.date));

  const { series, seriesKey } = assignProjectSeries(inWeek);

  const chartDays: ChartDay[] = days.map((dayKey, i) => {
    const perSeries = new Map<string, number>();
    for (const e of inWeek) {
      if (e.date !== dayKey) continue;
      const key = seriesKey(e.project.id);
      perSeries.set(key, (perSeries.get(key) ?? 0) + e.minutes);
    }
    const segments = series.filter((s) => perSeries.has(s.key)).map((s) => ({ key: s.key, minutes: perSeries.get(s.key)! }));
    return {
      dayKey,
      label: `${WEEKDAY_SHORT[i]} ${parseDayKey(dayKey).getDate()}`,
      totalMinutes: segments.reduce((sum, s) => sum + s.minutes, 0),
      segments,
    };
  });

  return {
    series,
    days: chartDays,
    totalMinutes: chartDays.reduce((sum, d) => sum + d.totalMinutes, 0),
    ...axisFor(Math.max(0, ...chartDays.map((d) => d.totalMinutes))),
  };
}
