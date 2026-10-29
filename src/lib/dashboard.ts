import {
  CALENDAR_TIME_ZONE,
  WEEKDAY_SHORT,
  addDays,
  eventDaySpan,
  instantToZonedTime,
  parseDayKey,
  toDayKey,
  type CalendarEventTiming,
} from "@/lib/calendar";
import { shiftWeek } from "@/lib/tiempo";

// Lógica del Dashboard, sin React ni Prisma: racha de StandUp, comparación de
// horas, la próxima reunión, los eventos de "Tu semana" y el feed de actividad.
//
// Todo lo que depende del día se calcula en hora de Chile (CALENDAR_TIME_ZONE),
// igual que las semanas de StandUp y horas, para que servidor y navegador
// escriban lo mismo sin esperar a hidratar.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ventana del feed de actividad. */
export const ACTIVITY_WINDOW_DAYS = 14;
export const ACTIVITY_LIMIT = 12;

function shiftDay(dayKey: string, days: number): string {
  return toDayKey(addDays(parseDayKey(dayKey), days));
}

/** Días completos de `from` a `to` (claves "YYYY-MM-DD"). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

// ─── Racha de StandUp ───

export interface StandupStreak {
  /** Semanas seguidas con StandUp. */
  weeks: number;
  /** Si ya se envió el de la semana en curso. */
  sentThisWeek: boolean;
}

/**
 * Semanas consecutivas con StandUp hasta la actual. La semana en curso suma si ya
 * se envió; si todavía no, la racha sigue viva hasta el domingo y se cuenta desde
 * la anterior. `weekStarts` son los lunes ("YYYY-MM-DD") con StandUp, en cualquier orden.
 */
export function standupStreak(weekStarts: string[], currentWeek: string): StandupStreak {
  const sent = new Set(weekStarts);
  const sentThisWeek = sent.has(currentWeek);

  let weeks = 0;
  let week = sentThisWeek ? currentWeek : shiftWeek(currentWeek, -1);
  while (sent.has(week)) {
    weeks++;
    week = shiftWeek(week, -1);
  }
  return { weeks, sentThisWeek };
}

// ─── Horas ───

export interface HoursComparison {
  /** Minutos de la semana en curso. */
  thisWeek: number;
  /** Minutos de la semana anterior hasta el mismo día de la semana que hoy, inclusive. */
  lastWeekSoFar: number;
  delta: number;
}

/**
 * Compara la semana en curso con la anterior "a esta altura": el lunes contra el
 * lunes pasado, el miércoles contra lunes–miércoles pasados. Contra la semana
 * anterior completa, cada lunes saldría muy abajo.
 */
export function compareWeekHours(
  thisWeek: { date: string; minutes: number }[],
  lastWeek: { date: string; minutes: number }[],
  today: string,
): HoursComparison {
  const sameDayLastWeek = shiftDay(today, -7);
  const total = (entries: { minutes: number }[]) => entries.reduce((sum, e) => sum + e.minutes, 0);
  const current = total(thisWeek);
  const previous = total(lastWeek.filter((e) => e.date <= sameDayLastWeek));
  return { thisWeek: current, lastWeekSoFar: previous, delta: current - previous };
}

// ─── Fechas ───

/** "Lun 9" */
export function formatShortDay(dayKey: string): string {
  const date = parseDayKey(dayKey);
  return `${WEEKDAY_SHORT[(date.getDay() + 6) % 7]} ${date.getDate()}`;
}

function shortMonth(dayKey: string): string {
  return new Intl.DateTimeFormat("es-CL", { month: "short", timeZone: "UTC" })
    .format(new Date(`${dayKey}T12:00:00Z`))
    .replace(".", "");
}

/** "Hoy", "Mañana", "Lun 9" dentro de la semana que viene, "Lun 9 nov" más adelante. */
export function formatUpcomingDay(dayKey: string, today: string): string {
  const days = daysBetween(today, dayKey);
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days > 1 && days < 7) return formatShortDay(dayKey);
  return `${formatShortDay(dayKey)} ${shortMonth(dayKey)}`;
}

/**
 * Tiempo relativo en español, por días de Chile: "ahora", "hace 5 min",
 * "hace 2 h" (mismo día), "ayer", "lun 3" (esta última semana), "3 oct" y,
 * de otro año, "3 oct 2025".
 */
export function formatRelativeTime(iso: string, now: Date, timeZone: string = CALENDAR_TIME_ZONE): string {
  const instant = new Date(iso);
  const minutes = Math.floor((now.getTime() - instant.getTime()) / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;

  const day = instantToZonedTime(instant, timeZone).date;
  const today = instantToZonedTime(now, timeZone).date;
  const days = daysBetween(day, today);
  if (days === 0) return `hace ${Math.floor(minutes / 60)} h`;
  if (days === 1) return "ayer";
  if (days < 7) return formatShortDay(day).toLowerCase();

  const date = parseDayKey(day);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return `${date.getDate()} ${shortMonth(day)}${sameYear ? "" : ` ${date.getFullYear()}`}`;
}

// ─── Eventos en hora de Chile ───

export interface ZonedEventSlot<T> {
  event: T;
  /** "18:00" en Chile, o null si es de día completo o viene de un día anterior. */
  time: string | null;
}

/**
 * Reparte los eventos en los días dados ("YYYY-MM-DD") según la hora de Chile, a
 * diferencia de eventsByDay (lib/calendar.ts), que usa la del navegador: el
 * Dashboard se arma en el servidor. Los de día completo se leen en UTC, como en
 * todo el calendario. Dentro de un día, primero los de día completo y luego por hora.
 */
export function eventsByZonedDay<T extends CalendarEventTiming>(
  events: T[],
  days: string[],
  timeZone: string = CALENDAR_TIME_ZONE,
): Map<string, ZonedEventSlot<T>[]> {
  const byDay = new Map<string, ZonedEventSlot<T>[]>(days.map((d) => [d, []]));
  const spans = events.map((event) => {
    if (event.allDay) return { event, ...eventDaySpan(event), start: null };
    const startsAt = new Date(event.startsAt);
    const lastInstant = new Date(Math.max(startsAt.getTime(), Date.parse(event.endsAt) - 1));
    const start = instantToZonedTime(startsAt, timeZone);
    return { event, first: start.date, last: instantToZonedTime(lastInstant, timeZone).date, start };
  });
  spans.sort((a, b) => Number(!a.event.allDay) - Number(!b.event.allDay) || a.event.startsAt.localeCompare(b.event.startsAt));

  for (const [day, list] of byDay) {
    for (const span of spans) {
      if (span.first > day || day > span.last) continue;
      list.push({ event: span.event, time: span.start && span.first === day ? span.start.time : null });
    }
  }
  return byDay;
}

// ─── Actividad reciente ───

export interface ActivityPerson {
  id: string;
  name: string;
}

interface ActivityBase {
  /** Único en el feed: tipo + id de la fila de origen. */
  id: string;
  /** Instante ISO. */
  at: string;
  /** null si quien lo hizo ya no es miembro. */
  actor: ActivityPerson | null;
  /** Si lo hizo quien mira el Dashboard: el texto va en segunda persona. */
  self: boolean;
  project: { id: string; name: string } | null;
  href: string | null;
}

export type ActivityItem = ActivityBase &
  (
    | { kind: "doc_edit"; doc: string; /** Guardados del mismo día que se juntaron en este. */ count: number }
    | { kind: "doc_comment"; doc: string }
    | { kind: "standup" }
    | { kind: "issue_open"; number: number; title: string }
    | { kind: "issue_close"; number: number; title: string; reason: string }
    | { kind: "issue_comment"; number: number; title: string }
    | { kind: "task_done"; /** Label actual, "T-03". */ label: string; name: string }
    | { kind: "event"; title: string }
    | { kind: "member_joined" }
    | { kind: "hours"; minutes: number }
  );

/**
 * Arma el feed: del más reciente al más antiguo, con los guardados de un mismo
 * documento por la misma persona en el mismo día de Chile juntos en uno (cada
 * guardado es una versión, y alguien que guarda diez veces taparía todo lo demás).
 */
export function buildActivityFeed(
  items: ActivityItem[],
  limit: number = ACTIVITY_LIMIT,
  timeZone: string = CALENDAR_TIME_ZONE,
): ActivityItem[] {
  const sorted = [...items].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  const feed: ActivityItem[] = [];
  const docEdits = new Map<string, ActivityItem & { kind: "doc_edit" }>();

  for (const item of sorted) {
    if (item.kind === "doc_edit") {
      const day = instantToZonedTime(new Date(item.at), timeZone).date;
      const key = `${item.href}|${item.actor?.id ?? ""}|${day}`;
      const existing = docEdits.get(key);
      if (existing) {
        existing.count += item.count;
        continue;
      }
      const copy = { ...item };
      docEdits.set(key, copy);
      feed.push(copy);
    } else {
      feed.push(item);
    }
  }
  return feed.slice(0, limit);
}

export type ActivitySegment = { text: string } | { strong: string } | { ref: string };

function hoursText(minutes: number): string {
  return `${Number((minutes / 60).toFixed(2))}h`;
}

/** La frase de un elemento del feed, en tercera persona o, si es propio, en segunda. */
export function describeActivity(item: ActivityItem): ActivitySegment[] {
  const actor: ActivitySegment[] = item.self ? [] : [{ strong: item.actor?.name ?? "Ex miembro" }];
  const verb = (third: string, second: string): ActivitySegment => ({ text: item.self ? second : ` ${third}` });

  switch (item.kind) {
    case "doc_edit":
      return [
        ...actor,
        verb("editó", "Editaste"),
        { text: " " },
        { strong: item.doc },
        ...(item.count > 1 ? [{ text: ` (${item.count} veces)` }] : []),
      ];
    case "doc_comment":
      return [...actor, verb("comentó en", "Comentaste en"), { text: " " }, { strong: item.doc }];
    case "standup":
      return [...actor, verb("envió su StandUp", "Enviaste tu StandUp")];
    case "issue_open":
      return [...actor, verb("abrió", "Abriste"), { text: " " }, { ref: `#${item.number}` }, { text: ` ${item.title}` }];
    case "issue_close":
      return [
        ...actor,
        verb("cerró", "Cerraste"),
        { text: " " },
        { ref: `#${item.number}` },
        { text: ` ${item.title} (${item.reason.toLowerCase()})` },
      ];
    case "issue_comment":
      return [...actor, verb("comentó en", "Comentaste en"), { text: " " }, { ref: `#${item.number}` }, { text: ` ${item.title}` }];
    case "task_done":
      return [...actor, verb("completó", "Completaste"), { text: " " }, { ref: item.label }, { text: ` ${item.name}` }];
    case "event":
      return [...actor, verb("agendó", "Agendaste"), { text: " " }, { strong: item.title }];
    case "member_joined":
      return [...actor, verb("se unió a CLIC", "Te uniste a CLIC")];
    case "hours":
      return [...actor, verb("registró", "Registraste"), { text: " " }, { strong: hoursText(item.minutes) }];
  }
}
