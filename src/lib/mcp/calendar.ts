import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { EventKind } from "@/generated/prisma/enums";
import {
  createEvent,
  getEvent,
  getEvents,
  MAX_RANGE_DAYS,
  parseCreateEventInput,
  parseEventRange,
  parseUpdateEventInput,
  updateEvent,
} from "@/lib/api/events.server";
import type { CalendarEventView } from "@/lib/api/events";
import {
  MAX_REPEAT_WEEKS,
  addDays,
  allDayToISO,
  instantToZonedTime,
  isoToAllDay,
  parseDayKey,
  toDayKey,
  zonedTimeToInstant,
} from "@/lib/calendar";
import { json, fail, run } from "@/lib/mcp/result";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayKey = z.string().regex(DAY_KEY, 'Formato "YYYY-MM-DD"');
const time = z.string().regex(TIME, 'Formato "HH:mm"');

/** Hora de Chile en lugar del instante UTC: es la que se ve en la app y la que el modelo va a repetir. */
function eventView(event: CalendarEventView) {
  const when = event.allDay
    ? { allDay: true, ...isoToAllDay(event.startsAt, event.endsAt) }
    : {
        allDay: false,
        start: instantToZonedTime(new Date(event.startsAt)),
        end: instantToZonedTime(new Date(event.endsAt)),
      };
  return {
    id: event.id,
    title: event.title,
    kind: event.kind,
    ...when,
    description: event.description,
    location: event.location,
    project: event.project,
    createdBy: event.createdBy?.name ?? null,
    seriesId: event.seriesId,
  };
}

/** Primer y último día (inclusive) que ocupa el evento, en la misma lectura que eventView. */
function eventDays(event: CalendarEventView): { first: string; last: string } {
  if (event.allDay) return isoToAllDay(event.startsAt, event.endsAt);
  return {
    first: instantToZonedTime(new Date(event.startsAt)).date,
    last: instantToZonedTime(new Date(event.endsAt)).date,
  };
}

type When = { allDay: boolean; date: string; endDate: string; startTime?: string; endTime?: string };

/** Días (inclusive) y horas de Chile a los instantes que guarda la API; null si a uno con hora le falta alguna. */
function toInstants(when: When): { startsAt: string; endsAt: string } | null {
  if (when.allDay) return allDayToISO(when.date, when.endDate);
  if (!when.startTime || !when.endTime) return null;
  return {
    startsAt: zonedTimeToInstant(when.date, when.startTime).toISOString(),
    endsAt: zonedTimeToInstant(when.endDate, when.endTime).toISOString(),
  };
}

/** Lo inverso de toInstants, para completar lo que update_event no recibe. */
function currentWhen(event: CalendarEventView): When {
  if (event.allDay) {
    const { first, last } = isoToAllDay(event.startsAt, event.endsAt);
    return { allDay: true, date: first, endDate: last };
  }
  const start = instantToZonedTime(new Date(event.startsAt));
  const end = instantToZonedTime(new Date(event.endsAt));
  return { allDay: false, date: start.date, endDate: end.date, startTime: start.time, endTime: end.time };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDayKey(key: string, days: number): string {
  return new Date(Date.parse(key) + days * DAY_MS).toISOString().slice(0, 10);
}

export function registerCalendarTools(server: McpServer): void {
  server.registerTool(
    "list_events",
    {
      title: "Ver calendario",
      description: `Eventos del calendario de CLIC entre dos fechas (inclusive, máx. ${MAX_RANGE_DAYS} días). Las horas están en hora de Chile.`,
      inputSchema: z.object({ from: dayKey, to: dayKey }),
      annotations: { readOnlyHint: true },
    },
    ({ from, to }) =>
      run(async () => {
        // La API toma `to` exclusivo y amplía un día por lado; acá se recorta al rango pedido.
        const range = parseEventRange(from, toDayKey(addDays(parseDayKey(to), 1)));
        if (!range) return fail(`Rango inválido: "to" no puede ser anterior a "from" ni cubrir más de ${MAX_RANGE_DAYS} días.`);

        const events = await getEvents(range.from, range.to);
        return json(
          events
            .filter((event) => {
              const { first, last } = eventDays(event);
              return first <= to && last >= from;
            })
            .map(eventView),
        );
      }),
  );

  server.registerTool(
    "create_event",
    {
      title: "Crear evento",
      description:
        "Crea un evento en el calendario. Fechas y horas en hora de Chile. Con repeatWeeklyUntil crea una copia por semana (no es recurrencia real: cada copia se edita aparte).",
      inputSchema: z.object({
        title: z.string().min(1).max(120),
        kind: z.enum(EventKind),
        allDay: z.boolean(),
        date: dayKey.describe("Primer día"),
        endDate: dayKey.optional().describe("Último día (inclusive); por defecto, el mismo que date"),
        startTime: time.optional().describe("Obligatoria si allDay es false"),
        endTime: time.optional().describe("Obligatoria si allDay es false"),
        description: z.string().optional(),
        location: z.string().optional(),
        projectId: z.string().optional().describe("Proyecto asociado (de list_projects)"),
        repeatWeeklyUntil: dayKey.optional().describe(`Último día de la serie, máx. ${MAX_REPEAT_WEEKS} semanas`),
      }),
    },
    (args) =>
      run(async () => {
        const instants = toInstants({ ...args, endDate: args.endDate ?? args.date });
        if (!instants) return fail("Un evento con hora necesita startTime y endTime.");

        const input = parseCreateEventInput({
          title: args.title,
          kind: args.kind,
          allDay: args.allDay,
          ...instants,
          description: args.description ?? null,
          location: args.location ?? null,
          projectId: args.projectId ?? null,
          repeatWeeklyUntil: args.repeatWeeklyUntil ?? null,
        });
        if (!input) {
          return fail(
            `Datos inválidos: el fin tiene que ser posterior al inicio, y repeatWeeklyUntil no puede ser anterior al evento ni pasar de ${MAX_REPEAT_WEEKS} semanas.`,
          );
        }
        const created = await createEvent(input);
        return json(created.map(eventView));
      }),
  );

  server.registerTool(
    "update_event",
    {
      title: "Editar evento",
      description:
        "Edita un evento del calendario: solo cambian los campos que se envían. Fechas y horas en hora de Chile. Si es parte de una serie, cambia solo esta ocurrencia. Solo puede editarlo quien lo creó o coordinación.",
      inputSchema: z.object({
        id: z.string().describe("id del evento (de list_events)"),
        title: z.string().min(1).max(120).optional(),
        kind: z.enum(EventKind).optional(),
        allDay: z.boolean().optional(),
        date: dayKey.optional().describe("Primer día. Si cambia y no se envía endDate, el último día se corre igual"),
        endDate: dayKey.optional().describe("Último día (inclusive)"),
        startTime: time.optional().describe("Obligatoria al pasar un evento de día completo a uno con hora"),
        endTime: time.optional().describe("Obligatoria al pasar un evento de día completo a uno con hora"),
        description: z.string().nullable().optional().describe("null para quitarla"),
        location: z.string().nullable().optional().describe("null para quitarla"),
        projectId: z.string().nullable().optional().describe("Proyecto asociado (de list_projects), o null para quitarlo"),
      }),
    },
    (args) =>
      run(async () => {
        const event = await getEvent(args.id);
        if (!event) return fail("No existe el evento");

        // Lo omitido se completa con lo actual. Mover el primer día corre también el
        // último, para que un evento de varios días conserve su duración.
        const current = currentWhen(event);
        const date = args.date ?? current.date;
        const span = (Date.parse(current.endDate) - Date.parse(current.date)) / DAY_MS;
        const allDay = args.allDay ?? current.allDay;
        const instants = toInstants({
          allDay,
          date,
          endDate: args.endDate ?? shiftDayKey(date, span),
          startTime: args.startTime ?? current.startTime,
          endTime: args.endTime ?? current.endTime,
        });
        if (!instants) return fail("Un evento con hora necesita startTime y endTime.");

        const input = parseUpdateEventInput({
          title: args.title ?? event.title,
          kind: args.kind ?? event.kind,
          allDay,
          ...instants,
          description: args.description !== undefined ? args.description : event.description,
          location: args.location !== undefined ? args.location : event.location,
          projectId: args.projectId !== undefined ? args.projectId : (event.project?.id ?? null),
        });
        if (!input) return fail("Datos inválidos: el fin tiene que ser posterior al inicio.");

        const updated = await updateEvent(args.id, input);
        if (!updated) return fail("No existe el evento");
        return json(eventView(updated));
      }),
  );
}
