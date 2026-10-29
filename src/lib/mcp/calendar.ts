import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { EventKind } from "@/generated/prisma/enums";
import { createEvent, getEvents, MAX_RANGE_DAYS, parseCreateEventInput, parseEventRange } from "@/lib/api/events.server";
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
        const endDate = args.endDate ?? args.date;
        let instants: { startsAt: string; endsAt: string };
        if (args.allDay) {
          instants = allDayToISO(args.date, endDate);
        } else {
          if (!args.startTime || !args.endTime) return fail("Un evento con hora necesita startTime y endTime.");
          instants = {
            startsAt: zonedTimeToInstant(args.date, args.startTime).toISOString(),
            endsAt: zonedTimeToInstant(endDate, args.endTime).toISOString(),
          };
        }

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
}
