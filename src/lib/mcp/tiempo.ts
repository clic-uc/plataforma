import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  createTimeEntry,
  deleteTimeEntry,
  getStandup,
  getTimeEntries,
  getTimeEntryLink,
  parseSaveStandupInput,
  parseTimeEntryFilter,
  parseTimeEntryInput,
  parseWeekParam,
  resolveTaskLabel,
  saveStandup,
  updateTimeEntry,
} from "@/lib/api/tiempo.server";
import type { TimeEntryInput, TimeEntryView } from "@/lib/api/tiempo";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_ENTRY_MINUTES,
  MAX_STANDUP_LENGTH,
  MINUTES_STEP,
  currentWeekStart,
  todayKey,
} from "@/lib/tiempo";
import { fail, json, run } from "@/lib/mcp/result";

const weekStart = z.string().describe('Lunes de la semana, "YYYY-MM-DD"');
const dayKey = z.string().describe('"YYYY-MM-DD"');

const entryFields = {
  projectId: z.string().describe("id del proyecto (de list_projects)"),
  minutes: z.number().int().describe(`Múltiplo de ${MINUTES_STEP}, entre ${MINUTES_STEP} y ${MAX_ENTRY_MINUTES}`),
  description: z.string().describe(`Qué se hizo, máx. ${MAX_DESCRIPTION_LENGTH} caracteres`),
};

const workKind = z
  .enum(["TRABAJO", "REVISION"])
  .optional()
  .describe("Con taskLabel: TRABAJO (por defecto) si es trabajo en la tarea, REVISION si es revisarla");

const taskLink = {
  taskLabel: z
    .string()
    .nullable()
    .optional()
    .describe("Label de una tarea del mismo proyecto (T-01) para vincular las horas; exige labelsToken"),
  labelsToken: z.string().optional().describe("labelsToken que devolvió get_project; obligatorio con taskLabel"),
  kind: workKind,
};

type Link = Pick<TimeEntryInput, "taskId" | "kind">;
type LinkArgs = { projectId: string; taskLabel?: string | null; labelsToken?: string; kind?: "TRABAJO" | "REVISION" };

const MANUAL: Link = { taskId: null, kind: "MANUAL" };

/**
 * Vínculo pedido con taskLabel, o un mensaje de error. La tarea va por label, así que
 * se resuelve con el labelsToken (los labels se renumeran), como en update_task.
 */
async function linkFromLabel(args: LinkArgs & { taskLabel: string }): Promise<Link | string> {
  if (!args.labelsToken) return "Para vincular una tarea envía también el labelsToken de get_project.";
  const taskId = await resolveTaskLabel(args.projectId, args.taskLabel, args.labelsToken);
  return { taskId, kind: args.kind ?? "TRABAJO" };
}

const INVALID_ENTRY = `Datos inválidos: los minutos van de ${MINUTES_STEP} en ${MINUTES_STEP} (de ${MINUTES_STEP} a ${MAX_ENTRY_MINUTES}), la fecha no puede ser futura y la descripción es obligatoria (máx. ${MAX_DESCRIPTION_LENGTH} caracteres).`;

function entryView(entry: TimeEntryView) {
  return {
    id: entry.id,
    date: entry.date,
    minutes: entry.minutes,
    description: entry.description,
    project: entry.project,
    // TRABAJO/REVISION: horas vinculadas a una tarea (al moverla o a mano); task es la tarea
    // con su label vigente, o null si es MANUAL o la tarea se borró.
    kind: entry.kind,
    task: entry.task,
  };
}

export function registerTiempoTools(server: McpServer): void {
  server.registerTool(
    "get_standup",
    {
      title: "Ver mi StandUp",
      description: "El StandUp propio de una semana, o null si todavía no se envió.",
      inputSchema: z.object({ weekStart: weekStart.optional().describe("Por defecto, la semana en curso") }),
      annotations: { readOnlyHint: true },
    },
    (args) =>
      run(async () => {
        const week = args.weekStart ?? currentWeekStart();
        if (!parseWeekParam(week)) return fail("weekStart tiene que ser un lunes con formato YYYY-MM-DD");
        return json({ weekStart: week, standup: await getStandup(week) });
      }),
  );

  server.registerTool(
    "submit_standup",
    {
      title: "Enviar StandUp",
      description:
        "Envía el StandUp semanal propio. Hay uno por semana: si ya existía, se reemplaza. Solo se acepta la semana en curso o la anterior.",
      inputSchema: z.object({
        text: z.string().describe(`¿Qué hice? Máx. ${MAX_STANDUP_LENGTH} caracteres`),
        learned: z.string().optional().describe(`¿Qué aprendí? Opcional, máx. ${MAX_STANDUP_LENGTH} caracteres`),
        weekStart: weekStart.optional().describe("Por defecto, la semana en curso"),
      }),
    },
    (args) =>
      run(async () => {
        const input = parseSaveStandupInput({
          weekStart: args.weekStart ?? currentWeekStart(),
          text: args.text,
          learned: args.learned ?? null,
        });
        if (!input) {
          return fail(
            `Datos inválidos: weekStart tiene que ser un lunes, y el texto es obligatorio (máx. ${MAX_STANDUP_LENGTH} caracteres).`,
          );
        }
        return json(await saveStandup(input));
      }),
  );

  server.registerTool(
    "list_time_entries",
    {
      title: "Mis horas",
      description:
        "Horas registradas por la persona conectada (las horas son personales: no se ven las de otros). Sin semana, las 200 más recientes.",
      inputSchema: z.object({
        weekStart: weekStart.optional(),
        projectId: z.string().optional().describe("Filtrar por proyecto"),
      }),
      annotations: { readOnlyHint: true },
    },
    (args) =>
      run(async () => {
        const filter = parseTimeEntryFilter(args.weekStart ?? null, args.projectId ?? null);
        if (!filter) return fail("weekStart tiene que ser un lunes con formato YYYY-MM-DD");
        const entries = await getTimeEntries(filter);
        return json({
          totalMinutes: entries.reduce((sum, e) => sum + e.minutes, 0),
          entries: entries.map(entryView),
        });
      }),
  );

  server.registerTool(
    "log_time",
    {
      title: "Registrar horas",
      description:
        "Registra horas propias en un proyecto. No se pueden registrar días futuros (según la fecha de Chile). Opcionalmente se vinculan a una tarea del proyecto (taskLabel + labelsToken de get_project) como trabajo o revisión; así suman en las horas dedicadas de la tarea.",
      inputSchema: z.object({
        ...entryFields,
        date: dayKey.optional().describe('"YYYY-MM-DD"; por defecto, hoy en Chile'),
        ...taskLink,
      }),
    },
    ({ taskLabel, labelsToken, kind, ...args }) =>
      run(async () => {
        let link = MANUAL;
        if (taskLabel) {
          const linked = await linkFromLabel({ projectId: args.projectId, taskLabel, labelsToken, kind });
          if (typeof linked === "string") return fail(linked);
          link = linked;
        } else if (kind) {
          return fail("kind solo se usa al vincular una tarea con taskLabel.");
        }
        const input = parseTimeEntryInput({ ...args, ...link, date: args.date ?? todayKey() });
        if (!input) return fail(INVALID_ENTRY);
        return json(entryView(await createTimeEntry(input)));
      }),
  );

  server.registerTool(
    "update_time_entry",
    {
      title: "Editar registro de horas",
      description:
        "Reemplaza un registro de horas propio. Hay que enviar fecha, proyecto, minutos y descripción. La tarea vinculada se conserva si se omite taskLabel y el proyecto no cambia (cambiar de proyecto la quita); taskLabel con un label la cambia y null la quita.",
      inputSchema: z.object({
        id: z.string().describe("id del registro (de list_time_entries)"),
        date: dayKey,
        ...entryFields,
        ...taskLink,
      }),
    },
    ({ id, taskLabel, labelsToken, kind, ...fields }) =>
      run(async () => {
        let link = MANUAL;
        if (taskLabel) {
          const linked = await linkFromLabel({ projectId: fields.projectId, taskLabel, labelsToken, kind });
          if (typeof linked === "string") return fail(linked);
          link = linked;
        } else if (taskLabel === undefined) {
          // Se conserva el vínculo actual, que puede venir de mover la tarea en el kanban.
          const current = await getTimeEntryLink(id);
          if (!current) return fail("No existe el registro");
          if (current.taskId && current.projectId === fields.projectId) {
            link = { taskId: current.taskId, kind: kind ?? current.kind };
          } else if (kind) {
            return fail("El registro no tiene una tarea vinculada en ese proyecto: envía taskLabel para vincularla.");
          }
        } else if (kind) {
          return fail("kind solo se usa al vincular una tarea con taskLabel.");
        }
        const input = parseTimeEntryInput({ ...fields, ...link });
        if (!input) return fail(INVALID_ENTRY);
        const entry = await updateTimeEntry(id, input);
        if (!entry) return fail("No existe el registro");
        return json(entryView(entry));
      }),
  );

  server.registerTool(
    "delete_time_entry",
    {
      title: "Borrar registro de horas",
      description: "Borra un registro de horas propio.",
      inputSchema: z.object({ id: z.string().describe("id del registro (de list_time_entries)") }),
      annotations: { destructiveHint: true },
    },
    ({ id }) =>
      run(async () => {
        if (!(await deleteTimeEntry(id))) return fail("No existe el registro");
        return json({ deleted: id });
      }),
  );
}
