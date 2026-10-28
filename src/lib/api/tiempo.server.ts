import "server-only";

import type { Prisma, Standup } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
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
import type {
  SaveStandupInput,
  StandupView,
  TimeEntryFilter,
  TimeEntryInput,
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
} satisfies Prisma.TimeEntryInclude;

type EntryRow = Prisma.TimeEntryGetPayload<{ include: typeof entryInclude }>;

function toEntryView(entry: EntryRow): TimeEntryView {
  return {
    id: entry.id,
    date: dateToDayKey(entry.date),
    minutes: entry.minutes,
    description: entry.description,
    project: entry.project,
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

/** `today` es el "hoy" de Chile: no se registran horas a futuro. */
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

  return { date: b.date, projectId, minutes: b.minutes, description };
}

async function assertProjectExists(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new ApiError(422, "INVALID_PROJECT", "El proyecto no existe");
}

function entryData(input: TimeEntryInput) {
  return {
    date: dayKeyToDate(input.date),
    projectId: input.projectId,
    minutes: input.minutes,
    description: input.description,
  };
}

export async function createTimeEntry(input: TimeEntryInput): Promise<TimeEntryView> {
  const member = await requireMember();
  await assertProjectExists(input.projectId);

  const entry = await prisma.timeEntry.create({
    data: { ...entryData(input), memberId: member.id },
    include: entryInclude,
  });
  return toEntryView(entry);
}

// Editar y borrar filtran por memberId: un registro ajeno responde 404, igual
// que uno que no existe, porque la API no expone las horas de otros.

export async function updateTimeEntry(id: string, input: TimeEntryInput): Promise<TimeEntryView | null> {
  const member = await requireMember();
  await assertProjectExists(input.projectId);

  const { count } = await prisma.timeEntry.updateMany({ where: { id, memberId: member.id }, data: entryData(input) });
  if (count === 0) return null;

  const entry = await prisma.timeEntry.findUnique({ where: { id }, include: entryInclude });
  return entry ? toEntryView(entry) : null;
}

export async function deleteTimeEntry(id: string): Promise<boolean> {
  const member = await requireMember();
  const { count } = await prisma.timeEntry.deleteMany({ where: { id, memberId: member.id } });
  return count > 0;
}
