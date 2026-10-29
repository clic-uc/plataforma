import "server-only";

import type { Prisma, Standup } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { TimeEntryKind } from "@/generated/prisma/enums";
import { requireMember } from "@/lib/auth/guards";
import { ApiError } from "@/lib/api/errors";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_HISTORY_ENTRIES,
  MAX_STANDUP_LENGTH,
  currentWeekStart,
  dateToDayKey,
  dayKeyToDate,
  isValidEntryMinutes,
  isWeekStart,
  shiftWeek,
  todayKey,
} from "@/lib/tiempo";
import { isDayKey } from "@/lib/calendar";
import { labelNumber } from "@/lib/api/labels";
import { resolveLabels } from "@/lib/api/projects.server";
import type {
  SaveStandupInput,
  StandupView,
  TimeEntryFilter,
  TimeEntryInput,
  TimeEntryTaskOption,
  TimeEntryView,
} from "@/lib/api/tiempo";

const DAY_MS = 24 * 60 * 60 * 1000;

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

// ─── StandUp ───

function toStandupView(standup: Standup): StandupView {
  return {
    memberId: standup.memberId,
    weekStart: dateToDayKey(standup.weekStart),
    text: standup.text,
    learned: standup.learned,
    updatedAt: standup.updatedAt.toISOString(),
  };
}

/** `week` de la query string si es un lunes válido, o null. */
export function parseWeekParam(value: unknown): string | null {
  return isWeekStart(value) ? value : null;
}

/** El StandUp propio de esa semana, o null si todavía no se envió. */
export async function getStandup(weekStart: string): Promise<StandupView | null> {
  const member = await requireMember();
  const standup = await prisma.standup.findUnique({
    where: { memberId_weekStart: { memberId: member.id, weekStart: dayKeyToDate(weekStart) } },
  });
  return standup ? toStandupView(standup) : null;
}

export function parseSaveStandupInput(body: unknown): SaveStandupInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (!isWeekStart(b.weekStart)) return null;

  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text || text.length > MAX_STANDUP_LENGTH) return null;

  if (b.learned !== null && typeof b.learned !== "string") return null;
  const learned = optionalText(b.learned);
  if (learned && learned.length > MAX_STANDUP_LENGTH) return null;

  return { weekStart: b.weekStart, text, learned };
}

/**
 * Crea o reemplaza el StandUp propio de la semana. Se acepta la semana en curso
 * y la anterior: la anterior cubre un formulario abierto el domingo que se envía
 * pasada la medianoche, sin abrir la puerta a reescribir el historial.
 */
export async function saveStandup(input: SaveStandupInput, now: Date = new Date()): Promise<StandupView> {
  const member = await requireMember();

  const current = currentWeekStart(now);
  if (input.weekStart !== current && input.weekStart !== shiftWeek(current, -1)) {
    throw new ApiError(422, "WEEK_CLOSED", "Solo puedes enviar el StandUp de esta semana");
  }

  const weekStart = dayKeyToDate(input.weekStart);
  const data = { text: input.text, learned: input.learned };
  const standup = await prisma.standup.upsert({
    where: { memberId_weekStart: { memberId: member.id, weekStart } },
    create: { memberId: member.id, weekStart, ...data },
    update: data,
  });
  return toStandupView(standup);
}

// ─── Horas ───

const entryInclude = {
  project: { select: { id: true, name: true } },
  task: { select: { label: true, name: true } },
} satisfies Prisma.TimeEntryInclude;

type EntryRow = Prisma.TimeEntryGetPayload<{ include: typeof entryInclude }>;

function toEntryView(entry: EntryRow): TimeEntryView {
  return {
    id: entry.id,
    date: dateToDayKey(entry.date),
    minutes: entry.minutes,
    description: entry.description,
    project: entry.project,
    kind: entry.kind,
    task: entry.task,
  };
}

/** Filtros del historial desde la query string, o null si `week` no es un lunes válido. */
export function parseTimeEntryFilter(week: string | null, projectId: string | null): TimeEntryFilter | null {
  if (week !== null && !isWeekStart(week)) return null;
  return { week, projectId: projectId?.trim() || null };
}

/** Registros propios, del más reciente al más antiguo. Sin semana, los MAX_HISTORY_ENTRIES más recientes. */
export async function getTimeEntries(filter: TimeEntryFilter): Promise<TimeEntryView[]> {
  const member = await requireMember();

  const where: Prisma.TimeEntryWhereInput = { memberId: member.id };
  if (filter.projectId) where.projectId = filter.projectId;
  if (filter.week) {
    const from = dayKeyToDate(filter.week);
    where.date = { gte: from, lt: new Date(from.getTime() + 7 * DAY_MS) };
  }

  const entries = await prisma.timeEntry.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: filter.week ? undefined : MAX_HISTORY_ENTRIES,
    include: entryInclude,
  });
  return entries.map(toEntryView);
}

function isTimeEntryKind(value: unknown): value is TimeEntryKind {
  return typeof value === "string" && Object.values(TimeEntryKind).includes(value as TimeEntryKind);
}

/**
 * `today` es el "hoy" de Chile: no se registran horas a futuro. `taskId` es obligatorio
 * aunque sea null, para que un cliente que no conoce el campo no desvincule por accidente
 * al editar. Con tarea, `kind` es TRABAJO o REVISION; sin tarea, MANUAL.
 */
export function parseTimeEntryInput(body: unknown, today: string = todayKey()): TimeEntryInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  // Las claves "YYYY-MM-DD" se comparan bien como texto.
  if (!isDayKey(b.date) || b.date > today) return null;
  if (!isValidEntryMinutes(b.minutes)) return null;

  const projectId = typeof b.projectId === "string" ? b.projectId.trim() : "";
  if (!projectId) return null;

  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (!description || description.length > MAX_DESCRIPTION_LENGTH) return null;

  if (b.taskId !== null && (typeof b.taskId !== "string" || !b.taskId.trim())) return null;
  const taskId = b.taskId === null ? null : b.taskId.trim();
  if (!isTimeEntryKind(b.kind)) return null;
  if ((taskId === null) !== (b.kind === TimeEntryKind.MANUAL)) return null;

  return { date: b.date, projectId, minutes: b.minutes, description, taskId, kind: b.kind };
}

async function assertProjectExists(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new ApiError(422, "INVALID_PROJECT", "El proyecto no existe");
}

/** Cualquier tarea del proyecto, de cualquier columna y de quien sea: las horas son de quien las registra. */
async function assertTaskInProject(taskId: string | null, projectId: string): Promise<void> {
  if (!taskId) return;
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  if (task?.projectId !== projectId) {
    throw new ApiError(422, "INVALID_TASK", "La tarea no existe en ese proyecto");
  }
}

async function assertEntryTargets(input: TimeEntryInput): Promise<void> {
  await assertProjectExists(input.projectId);
  await assertTaskInProject(input.taskId, input.projectId);
}

function entryData(input: TimeEntryInput) {
  return {
    date: dayKeyToDate(input.date),
    projectId: input.projectId,
    minutes: input.minutes,
    description: input.description,
    taskId: input.taskId,
    kind: input.kind,
  };
}

/**
 * Task.id de una tarea dada por label, para el MCP (la API y la UI ya mandan el id). Los
 * labels se renumeran, así que exige el labelsToken como cualquier mutación por label.
 */
export async function resolveTaskLabel(projectId: string, label: string, token: string): Promise<string> {
  await requireMember();
  const taskId = (await resolveLabels(projectId, token)).taskId(label.trim());
  if (!taskId) throw new ApiError(422, "INVALID_TASK", `La tarea ${label} no existe en este proyecto`);
  return taskId;
}

/** Proyecto y vínculo de un registro propio, o null si no existe o es ajeno. */
export async function getTimeEntryLink(
  id: string,
): Promise<Pick<TimeEntryInput, "projectId" | "taskId" | "kind"> | null> {
  const member = await requireMember();
  return prisma.timeEntry.findFirst({
    where: { id, memberId: member.id },
    select: { projectId: true, taskId: true, kind: true },
  });
}

/** Tareas del proyecto para vincular horas en /tiempo, por número de label; null si el proyecto no existe. */
export async function getTimeEntryTaskOptions(projectId: string): Promise<TimeEntryTaskOption[] | null> {
  await requireMember();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tasks: { select: { id: true, label: true, name: true, column: true } } },
  });
  if (!project) return null;
  return project.tasks.sort((a, b) => labelNumber("T", a.label) - labelNumber("T", b.label));
}

export async function createTimeEntry(input: TimeEntryInput): Promise<TimeEntryView> {
  const member = await requireMember();
  await assertEntryTargets(input);

  const entry = await prisma.timeEntry.create({
    data: { ...entryData(input), memberId: member.id },
    include: entryInclude,
  });
  return toEntryView(entry);
}

// Editar y borrar filtran por memberId: un registro ajeno responde 404, igual
// que uno que no existe, porque la API no expone las horas de otros.

/**
 * Reemplaza el registro entero, vínculo incluido: el body trae la tarea (o null) y el
 * tipo, así que se puede cambiar, quitar o agregar. Cambiar de proyecto sin elegir una
 * tarea del nuevo deja el registro manual; una tarea de otro proyecto es 422 INVALID_TASK.
 */
export async function updateTimeEntry(id: string, input: TimeEntryInput): Promise<TimeEntryView | null> {
  const member = await requireMember();
  await assertEntryTargets(input);

  const current = await prisma.timeEntry.findFirst({ where: { id, memberId: member.id }, select: { id: true } });
  if (!current) return null;

  const entry = await prisma.timeEntry.update({
    where: { id },
    data: entryData(input),
    include: entryInclude,
  });
  return toEntryView(entry);
}

export async function deleteTimeEntry(id: string): Promise<boolean> {
  const member = await requireMember();
  const { count } = await prisma.timeEntry.deleteMany({ where: { id, memberId: member.id } });
  return count > 0;
}
