import "server-only";

import { randomUUID } from "node:crypto";
import { EventKind } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError, requireMember } from "@/lib/auth/guards";
import type { CurrentMember } from "@/lib/auth/current-member";
import { ApiError } from "@/lib/api/errors";
import { getInitials } from "@/lib/api/format";
import { isDayKey, weeklyOccurrences } from "@/lib/calendar";
import type { CalendarEventView, CreateEventInput, UpdateEventInput } from "@/lib/api/events";

const DAY_MS = 24 * 60 * 60 * 1000;

/** La grilla mes cubre como mucho 6 semanas (42 días); el margen deja holgura sin abrir consultas arbitrarias. */
export const MAX_RANGE_DAYS = 45;

const MAX_TITLE_LENGTH = 120;

const eventInclude = {
  project: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.CalendarEventInclude;

type EventRow = Prisma.CalendarEventGetPayload<{ include: typeof eventInclude }>;

function canEdit(member: CurrentMember, createdById: string | null): boolean {
  return member.role === "COORDINACION" || createdById === member.id;
}

function toView(event: EventRow, member: CurrentMember): CalendarEventView {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    kind: event.kind,
    allDay: event.allDay,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    seriesId: event.seriesId,
    project: event.project,
    createdBy: event.createdBy
      ? { id: event.createdBy.id, name: event.createdBy.name, initials: getInitials(event.createdBy.name) }
      : null,
    canEdit: canEdit(member, event.createdById),
  };
}

/** `from`/`to` ("YYYY-MM-DD", `to` exclusivo) del rango visible, o null si es inválido o pasa de MAX_RANGE_DAYS. */
export function parseEventRange(from: unknown, to: unknown): { from: string; to: string } | null {
  if (!isDayKey(from) || !isDayKey(to)) return null;
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  if (days <= 0 || days > MAX_RANGE_DAYS) return null;
  return { from, to };
}

/**
 * Eventos que se solapan con el rango visible de la grilla. Las claves de día son
 * locales del navegador y acá se interpretan en UTC, así que se amplía un día por
 * lado para cubrir el desfase; el cliente ubica cada evento con precisión.
 */
export async function getEvents(from: string, to: string): Promise<CalendarEventView[]> {
  const member = await requireMember();

  const events = await prisma.calendarEvent.findMany({
    where: {
      startsAt: { lt: new Date(Date.parse(to) + DAY_MS) },
      endsAt: { gt: new Date(Date.parse(from) - DAY_MS) },
    },
    orderBy: [{ startsAt: "asc" }, { endsAt: "desc" }],
    include: eventInclude,
  });

  return events.map((event) => toView(event, member));
}

// ─── Validación ───

/** Instante ISO con zona explícita: "2026-10-14T21:00:00.000Z" o "2026-10-14T18:00-03:00". */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function parseInstant(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_INSTANT.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

export function parseUpdateEventInput(body: unknown): UpdateEventInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title || title.length > MAX_TITLE_LENGTH) return null;

  const kind = typeof b.kind === "string" ? b.kind : "";
  if (!(Object.values(EventKind) as string[]).includes(kind)) return null;

  if (typeof b.allDay !== "boolean") return null;
  const allDay = b.allDay;

  const startsAt = parseInstant(b.startsAt);
  const endsAt = parseInstant(b.endsAt);
  if (!startsAt || !endsAt || endsAt <= startsAt) return null;
  // Los de día completo son fechas, no instantes: tienen que caer a medianoche UTC.
  if (allDay && (startsAt.getTime() % DAY_MS !== 0 || endsAt.getTime() % DAY_MS !== 0)) return null;

  // Obligatorio aunque sea null, como assigneeId en las tareas: un PATCH de un
  // cliente que no conoce el campo desvincularía el proyecto sin querer.
  const rawProjectId = b.projectId;
  if (rawProjectId !== null && typeof rawProjectId !== "string") return null;
  const projectId = rawProjectId?.trim() || null;

  return {
    title,
    description: optionalText(b.description),
    location: optionalText(b.location),
    kind: kind as EventKind,
    allDay,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    projectId,
  };
}

export function parseCreateEventInput(body: unknown): CreateEventInput | null {
  const base = parseUpdateEventInput(body);
  if (!base) return null;

  const until = (body as Record<string, unknown>).repeatWeeklyUntil ?? null;
  if (until === null) return { ...base, repeatWeeklyUntil: null };
  if (!isDayKey(until)) return null;

  // Hasta antes del primer día o más allá del tope de semanas.
  const occurrences = weeklyOccurrences(
    { allDay: base.allDay, startsAt: new Date(base.startsAt), endsAt: new Date(base.endsAt) },
    until,
  );
  if (!occurrences) return null;

  return { ...base, repeatWeeklyUntil: until };
}

// ─── Mutaciones ───

async function assertProjectExists(projectId: string | null): Promise<void> {
  if (!projectId) return;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new ApiError(422, "INVALID_PROJECT", "El proyecto asociado no existe");
}

function assertCanEdit(member: CurrentMember, createdById: string | null): void {
  if (!canEdit(member, createdById)) {
    throw new AuthError(403, "FORBIDDEN_ROLE", "Solo quien creó el evento o coordinación puede modificarlo");
  }
}

function eventData(input: UpdateEventInput) {
  return {
    title: input.title,
    description: input.description,
    location: input.location,
    kind: input.kind,
    allDay: input.allDay,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    projectId: input.projectId,
  };
}

/** Crea el evento, o una copia por semana si viene repeatWeeklyUntil. Devuelve todo lo creado. */
export async function createEvent(input: CreateEventInput): Promise<CalendarEventView[]> {
  const member = await requireMember();
  await assertProjectExists(input.projectId);

  const data = eventData(input);
  const occurrences = input.repeatWeeklyUntil
    ? weeklyOccurrences(data, input.repeatWeeklyUntil)
    : [{ startsAt: data.startsAt, endsAt: data.endsAt }];
  // parseCreateEventInput ya validó la serie.
  if (!occurrences) throw new Error("Serie semanal inválida");

  const seriesId = occurrences.length > 1 ? randomUUID() : null;
  const created = await prisma.$transaction(
    occurrences.map((o) =>
      prisma.calendarEvent.create({
        data: { ...data, ...o, seriesId, createdById: member.id },
        include: eventInclude,
      }),
    ),
  );

  return created.map((event) => toView(event, member));
}

export async function updateEvent(id: string, input: UpdateEventInput): Promise<CalendarEventView | null> {
  const member = await requireMember();

  const existing = await prisma.calendarEvent.findUnique({ where: { id }, select: { createdById: true } });
  if (!existing) return null;
  assertCanEdit(member, existing.createdById);
  await assertProjectExists(input.projectId);

  const { count } = await prisma.calendarEvent.updateMany({ where: { id }, data: eventData(input) });
  if (count === 0) return null;

  const event = await prisma.calendarEvent.findUnique({ where: { id }, include: eventInclude });
  return event ? toView(event, member) : null;
}

export async function deleteEvent(id: string): Promise<boolean> {
  const member = await requireMember();

  const existing = await prisma.calendarEvent.findUnique({ where: { id }, select: { createdById: true } });
  if (!existing) return false;
  assertCanEdit(member, existing.createdById);

  const { count } = await prisma.calendarEvent.deleteMany({ where: { id } });
  return count > 0;
}
