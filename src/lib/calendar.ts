import { parseISODateInput, toISODateInput } from "@/lib/api/format";

// Lógica de fechas del calendario, sin React ni Prisma.
//
// Dos clases de fecha conviven acá:
// - Días de la grilla: claves "YYYY-MM-DD" y Date a medianoche local. Se operan
//   con getters locales (getFullYear/getMonth/getDate), igual que format.ts.
// - Eventos: con hora son instantes UTC que se muestran en la hora local del
//   navegador; de día completo son fechas a medianoche UTC que se leen con getters
//   UTC, para que en Chile (UTC−3/−4) no caigan el día anterior.

/** Zona de referencia para lo que no corre en el navegador: el "hoy" del servidor y las series. */
export const CALENDAR_TIME_ZONE = "America/Santiago";

/** Tope de "repetir semanalmente": hasta 26 semanas después de la primera ocurrencia. */
export const MAX_REPEAT_WEEKS = 26;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;

export type CalendarViewMode = "mes" | "semana";

/** Lo mínimo de un evento que la grilla necesita para ubicarlo. */
export interface CalendarEventTiming {
  allDay: boolean;
  /** Instante ISO. */
  startsAt: string;
  /** Instante ISO, exclusivo. */
  endsAt: string;
}

// ─── Días ───

export const toDayKey = toISODateInput;
export const parseDayKey = parseISODateInput;

export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // Descarta fechas que Date normaliza, como 2026-02-30.
  return toDayKey(parseDayKey(value)) === value;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

/** Mismo día del mes, recortado al último si no existe (31 ene + 1 mes = 28/29 feb). */
export function addMonths(date: Date, months: number): Date {
  const first = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), lastDay));
}

/** Lunes de la semana de `date`. */
export function startOfWeek(date: Date): Date {
  const mondayOffset = (date.getDay() + 6) % 7;
  return addDays(date, -mondayOffset);
}

/** Días completos entre dos fechas de grilla; inmune a los cambios de horario. */
function daysBetween(from: Date, to: Date): number {
  return Math.round(
    (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
      Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
      DAY_MS,
  );
}

export interface DayRange {
  days: Date[];
  /** Primer día visible, "YYYY-MM-DD". */
  from: string;
  /** Día siguiente al último visible, "YYYY-MM-DD" (exclusivo). */
  to: string;
}

export interface MonthGrid extends DayRange {
  /** Filas lunes–domingo; 4 a 6 según el mes. */
  weeks: Date[][];
}

/** Semanas lunes–domingo que cubren el mes de `date`. */
export function monthGrid(date: Date): MonthGrid {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 7);

  const days = Array.from({ length: daysBetween(start, end) }, (_, i) => addDays(start, i));
  const weeks = Array.from({ length: days.length / 7 }, (_, w) => days.slice(w * 7, w * 7 + 7));
  return { days, weeks, from: toDayKey(start), to: toDayKey(end) };
}

/** Lunes a domingo de la semana de `date`. */
export function weekRange(date: Date): DayRange {
  const start = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return { days, from: toDayKey(start), to: toDayKey(addDays(start, 7)) };
}

export function visibleRange(view: CalendarViewMode, dayKey: string): DayRange {
  const date = parseDayKey(dayKey);
  return view === "mes" ? monthGrid(date) : weekRange(date);
}

/**
 * Vista y fecha desde los searchParams de /calendario. Lo inválido cae en los
 * defaults en lugar de dar error: un link viejo o mal copiado igual abre el calendario.
 */
export function parseCalendarParams(
  vista: string | string[] | undefined,
  fecha: string | string[] | undefined,
  todayKey: string,
): { view: CalendarViewMode; date: string } {
  return {
    view: vista === "semana" ? "semana" : "mes",
    date: isDayKey(fecha) ? fecha : todayKey,
  };
}

// ─── Zona horaria ───

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** "YYYY-MM-DD" de hoy en `timeZone`. El servidor lo usa cuando la URL no trae fecha. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  const { year, month, day } = zonedParts(now, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Minutos que `timeZone` está adelantada respecto de UTC en ese instante (Chile: −180 o −240). */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/**
 * Suma días de calendario conservando la hora de reloj en `timeZone`: una reunión
 * de las 18:00 sigue a las 18:00 después del cambio de horario, aunque eso
 * signifique que entre dos ocurrencias no pasen exactamente 7 × 24 h.
 */
export function addDaysInZone(instant: Date, days: number, timeZone: string): Date {
  const p = zonedParts(instant, timeZone);
  const wallClock = Date.UTC(p.year, p.month - 1, p.day + days, p.hour, p.minute, p.second, instant.getUTCMilliseconds());
  // Primera aproximación con el offset del instante original; se corrige con el
  // del resultado por si entre ambos hubo cambio de horario.
  let result = wallClock - zoneOffsetMinutes(instant, timeZone) * 60000;
  result = wallClock - zoneOffsetMinutes(new Date(result), timeZone) * 60000;
  return new Date(result);
}

/** Instante de la hora de reloj `time` ("HH:mm") del día `dayKey` en `timeZone`. */
export function zonedTimeToInstant(dayKey: string, time: string, timeZone: string = CALENDAR_TIME_ZONE): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  // Igual que addDaysInZone: el offset se corrige con el del resultado, por si la
  // hora pedida cae del otro lado de un cambio de horario.
  let result = wallClock - zoneOffsetMinutes(new Date(wallClock), timeZone) * 60000;
  result = wallClock - zoneOffsetMinutes(new Date(result), timeZone) * 60000;
  return new Date(result);
}

/** Inverso de zonedTimeToInstant: día ("YYYY-MM-DD") y hora ("HH:mm") de reloj en `timeZone`. */
export function instantToZonedTime(instant: Date, timeZone: string = CALENDAR_TIME_ZONE): { date: string; time: string } {
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

// ─── Series semanales ───

/**
 * Ocurrencias de "repetir semanalmente hasta `untilKey`" (inclusive), empezando
 * por el propio evento. Devuelve null si la serie pasa de `MAX_REPEAT_WEEKS`
 * semanas o si `untilKey` es anterior al primer día del evento.
 *
 * El primer día y `untilKey` se comparan como fechas de calendario: UTC para los
 * eventos de día completo, `timeZone` para los con hora.
 */
export function weeklyOccurrences(
  event: { allDay: boolean; startsAt: Date; endsAt: Date },
  untilKey: string,
  timeZone: string = CALENDAR_TIME_ZONE,
): { startsAt: Date; endsAt: Date }[] | null {
  const startKey = event.allDay ? event.startsAt.toISOString().slice(0, 10) : todayInZone(timeZone, event.startsAt);
  const weeks = Math.floor(daysBetween(parseDayKey(startKey), parseDayKey(untilKey)) / 7);
  if (untilKey < startKey || weeks > MAX_REPEAT_WEEKS) return null;

  const durationMs = event.endsAt.getTime() - event.startsAt.getTime();
  return Array.from({ length: weeks + 1 }, (_, i) => {
    if (event.allDay) {
      return {
        startsAt: new Date(event.startsAt.getTime() + i * 7 * DAY_MS),
        endsAt: new Date(event.endsAt.getTime() + i * 7 * DAY_MS),
      };
    }
    const startsAt = addDaysInZone(event.startsAt, i * 7, timeZone);
    return { startsAt, endsAt: new Date(startsAt.getTime() + durationMs) };
  });
}

// ─── Eventos en la grilla ───

/** "YYYY-MM-DD" (UTC) de un instante a medianoche UTC; así se leen los eventos de día completo. */
function utcDayKey(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/**
 * Días de calendario que ocupa un evento: `[first, last]`, ambos inclusive.
 * Un evento con hora que termina justo a medianoche no ocupa el día siguiente.
 */
export function eventDaySpan(event: CalendarEventTiming): { first: string; last: string } {
  const startsAt = new Date(event.startsAt);
  const endsAt = new Date(event.endsAt);
  if (event.allDay) {
    return { first: utcDayKey(startsAt), last: utcDayKey(new Date(endsAt.getTime() - DAY_MS)) };
  }
  const lastInstant = new Date(Math.max(startsAt.getTime(), endsAt.getTime() - 1));
  return { first: toDayKey(startsAt), last: toDayKey(lastInstant) };
}

/** Los de día completo y los que cruzan medianoche van en la fila "todo el día" de la semana. */
export function isAllDayRow(event: CalendarEventTiming): boolean {
  if (event.allDay) return true;
  const { first, last } = eventDaySpan(event);
  return first !== last;
}

/**
 * Reparte los eventos en los días dados (claves "YYYY-MM-DD"). Un evento de
 * varios días aparece en cada día que cubre. Dentro de un día, primero los de la
 * fila "todo el día" y luego por hora de inicio.
 */
export function eventsByDay<T extends CalendarEventTiming>(events: T[], days: Date[]): Map<string, T[]> {
  const byDay = new Map<string, T[]>(days.map((d) => [toDayKey(d), []]));
  const spans = events.map((event) => ({ event, ...eventDaySpan(event), allDayRow: isAllDayRow(event) }));
  spans.sort(
    (a, b) =>
      Number(b.allDayRow) - Number(a.allDayRow) ||
      a.event.startsAt.localeCompare(b.event.startsAt) ||
      b.last.localeCompare(a.last),
  );

  for (const [key, list] of byDay) {
    for (const span of spans) {
      if (span.first <= key && key <= span.last) list.push(span.event);
    }
  }
  return byDay;
}

/** Minuto de inicio y fin de un evento con hora dentro del día `dayKey`, recortado a [0, 1440]. */
export function minutesInDay(event: CalendarEventTiming, dayKey: string): { start: number; end: number } {
  const dayStart = parseDayKey(dayKey);
  const dayEnd = addDays(dayStart, 1);
  const toMinutes = (instant: Date) => {
    if (instant <= dayStart) return 0;
    if (instant >= dayEnd) return MINUTES_PER_DAY;
    return instant.getHours() * 60 + instant.getMinutes();
  };
  return { start: toMinutes(new Date(event.startsAt)), end: toMinutes(new Date(event.endsAt)) };
}

export interface DayColumnItem<T> {
  item: T;
  start: number;
  end: number;
}

export interface DayColumnPlacement<T> extends DayColumnItem<T> {
  /** Carril, desde 0. */
  lane: number;
  /** Carriles del grupo de solapes al que pertenece; el ancho es 1 / lanes. */
  lanes: number;
}

/**
 * Carriles para los eventos de una columna de la vista semana. Los eventos que se
 * solapan (directa o encadenadamente) forman un grupo y se reparten su ancho;
 * cada uno toma el primer carril libre a su hora de inicio.
 *
 * `minDuration` alarga solo para este cálculo los eventos muy cortos, que en
 * pantalla ocupan más alto que su duración real y si no se pisarían.
 */
export function layoutDayColumn<T>(items: DayColumnItem<T>[], minDuration = 0): DayColumnPlacement<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const placements: DayColumnPlacement<T>[] = [];

  let group: DayColumnPlacement<T>[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;

  const closeGroup = () => {
    for (const p of group) p.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };

  for (const entry of sorted) {
    const end = Math.max(entry.end, entry.start + minDuration);
    if (entry.start >= groupEnd) closeGroup();

    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= entry.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = end;
    groupEnd = group.length === 0 ? end : Math.max(groupEnd, end);

    const placement = { ...entry, lane, lanes: 1 };
    group.push(placement);
    placements.push(placement);
  }
  closeGroup();

  return placements;
}

// ─── Formato ───

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const WEEKDAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function shortMonth(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("es-CL", { month: "short", timeZone }).format(date).replace(".", "");
}

/** "Octubre 2026" */
export function monthTitle(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/** "5 – 11 oct 2026", "28 sept – 4 oct 2026", "29 dic 2025 – 4 ene 2026" */
export function weekTitle(date: Date): string {
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  const endPart = `${end.getDate()} ${shortMonth(end)} ${end.getFullYear()}`;
  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.getDate()} ${shortMonth(start)} ${start.getFullYear()} – ${endPart}`;
  }
  if (start.getMonth() !== end.getMonth()) return `${start.getDate()} ${shortMonth(start)} – ${endPart}`;
  return `${start.getDate()} – ${endPart}`;
}

export function periodTitle(view: CalendarViewMode, dayKey: string): string {
  const date = parseDayKey(dayKey);
  return view === "mes" ? monthTitle(date) : weekTitle(date);
}

/** "18:00" en hora local. */
export function formatTime(instant: Date): string {
  return new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
}

function formatDay(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone })
    .format(date)
    .replace(/\./g, "");
}

/**
 * Horario legible de un evento para el detalle:
 * "mié, 14 oct 2026 · Todo el día", "14 oct – 16 oct 2026",
 * "mié, 14 oct 2026 · 18:00 – 19:00", "14 oct 18:00 – 15 oct 10:00".
 */
export function formatEventWhen(event: CalendarEventTiming): string {
  const startsAt = new Date(event.startsAt);
  const endsAt = new Date(event.endsAt);
  const { first, last } = eventDaySpan(event);

  if (event.allDay) {
    if (first === last) return `${formatDay(startsAt, "UTC")} · Todo el día`;
    const lastDay = new Date(endsAt.getTime() - DAY_MS);
    return `${startsAt.getUTCDate()} ${shortMonth(startsAt, "UTC")} – ${lastDay.getUTCDate()} ${shortMonth(lastDay, "UTC")} ${lastDay.getUTCFullYear()}`;
  }

  if (first === last) return `${formatDay(startsAt)} · ${formatTime(startsAt)} – ${formatTime(endsAt)}`;
  return `${startsAt.getDate()} ${shortMonth(startsAt)} ${formatTime(startsAt)} – ${endsAt.getDate()} ${shortMonth(endsAt)} ${formatTime(endsAt)}`;
}

// ─── Formularios ───
//
// Los inputs nativos trabajan con "YYYY-MM-DD" y "HH:MM" locales; la API con instantes ISO.

/** Instante ISO de una fecha y hora locales. */
export function localDateTimeToISO(dayKey: string, time: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

/** Fecha y hora locales de un instante ISO, para precargar los inputs. */
export function isoToLocalDateTime(iso: string): { date: string; time: string } {
  const instant = new Date(iso);
  return { date: toDayKey(instant), time: formatTime(instant) };
}

/**
 * Instantes de un evento de día completo: el primer día a medianoche UTC y el
 * día siguiente al último (`lastDayKey`, inclusive en el formulario), también a
 * medianoche UTC.
 */
export function allDayToISO(firstDayKey: string, lastDayKey: string): { startsAt: string; endsAt: string } {
  const end = new Date(`${lastDayKey}T00:00:00.000Z`);
  return {
    startsAt: `${firstDayKey}T00:00:00.000Z`,
    endsAt: new Date(end.getTime() + DAY_MS).toISOString(),
  };
}

/** Inverso de allDayToISO: primer y último día (inclusive) de un evento de día completo. */
export function isoToAllDay(startsAt: string, endsAt: string): { first: string; last: string } {
  return eventDaySpan({ allDay: true, startsAt, endsAt });
}
