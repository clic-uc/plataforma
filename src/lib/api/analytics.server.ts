import "server-only";

import { prisma } from "@/lib/prisma";
import { requireCoordinacion } from "@/lib/auth/guards";
import { getInitials } from "@/lib/api/format";
import {
  DEFAULT_RANGE,
  STREAK_WINDOW_WEEKS,
  buildActivityReport,
  buildProjectsReport,
  buildTeamReport,
  buildWeekStandups,
  isRangeWeeks,
  rangeWeeks,
  type ActivityMemberInput,
  type ActivityReport,
  type ProjectsReport,
  type RangeWeeks,
  type TeamReport,
  type WeekStandups,
} from "@/lib/analytics";
import { buildKanbanReport, type EffortKind, type KanbanReport } from "@/lib/kanban-metrics";
import { zonedTimeToInstant } from "@/lib/calendar";
import { currentWeekStart, dateToDayKey, dayKeyToDate, isWeekStart, shiftWeek, todayKey, weekStartOf } from "@/lib/tiempo";

// Analíticas de coordinación. Todo es solo lectura y exige COORDINACION.
//
// Excepción deliberada a "las horas son personales" (tiempo.server.ts): acá
// coordinación ve las horas y los StandUps de todo el equipo. Editar y borrar un
// registro sigue siendo solo de quien lo hizo.
//
// Cada función hace unas pocas consultas agregadas en paralelo (groupBy) en vez
// de una por persona o proyecto; el armado está en src/lib/analytics.ts.

/** Solo miembros aprobados: una cuenta pendiente no es miembro todavía. */
const approved = { isVerifiedByCoordinator: true } as const;

const memberSelect = { id: true, name: true, image: true, role: true, status: true, joinedAt: true } as const;

async function approvedMembers(): Promise<ActivityMemberInput[]> {
  const rows = await prisma.member.findMany({ where: approved, select: memberSelect });
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    initials: getInitials(m.name),
    image: m.image,
    role: m.role,
    status: m.status,
    // joinedAt es un instante (la aprobación); su semana se toma en hora de Chile.
    joinedWeek: weekStartOf(todayKey(m.joinedAt)),
  }));
}

/** `weeks` de la query string: sin valor, el rango por defecto; null si no es una opción válida. */
export function parseRangeParam(value: string | null): RangeWeeks | null {
  if (value === null) return DEFAULT_RANGE;
  const weeks = Number(value);
  return isRangeWeeks(weeks) ? weeks : null;
}

/** `week` de la query string si es un lunes que no está en el futuro, o null. */
export function parseStandupWeekParam(value: string | null, now: Date = new Date()): string | null {
  return isWeekStart(value) && value <= currentWeekStart(now) ? value : null;
}

/** Horas y StandUps por persona en las `weeks` semanas que terminan en la actual. */
export async function getActivityReport(weeks: RangeWeeks, now: Date = new Date()): Promise<ActivityReport> {
  await requireCoordinacion();

  const currentWeek = currentWeekStart(now);
  const range = rangeWeeks(currentWeek, weeks);
  const end = dayKeyToDate(shiftWeek(currentWeek, 1));

  const [members, entries, projects, standups] = await Promise.all([
    approvedMembers(),
    prisma.timeEntry.groupBy({
      by: ["memberId", "projectId", "date"],
      where: { date: { gte: dayKeyToDate(range[0]), lt: end } },
      _sum: { minutes: true },
    }),
    prisma.project.findMany({ select: { id: true, name: true } }),
    // Más atrás que el rango: la racha se cuenta en una ventana propia.
    prisma.standup.findMany({
      where: { weekStart: { gte: dayKeyToDate(shiftWeek(currentWeek, -STREAK_WINDOW_WEEKS)), lt: end } },
      select: { memberId: true, weekStart: true },
    }),
  ]);

  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  return buildActivityReport({
    weeks: range,
    members,
    entries: entries.map((e) => ({
      memberId: e.memberId,
      date: dateToDayKey(e.date),
      minutes: e._sum.minutes ?? 0,
      project: { id: e.projectId, name: projectName.get(e.projectId) ?? "Proyecto" },
    })),
    standups: standups.map((s) => ({ memberId: s.memberId, weekStart: dateToDayKey(s.weekStart) })),
  });
}

/** Los StandUps de una semana, para leerlos, y quién falta. */
export async function getWeekStandups(week: string): Promise<WeekStandups> {
  await requireCoordinacion();

  const [members, standups] = await Promise.all([
    approvedMembers(),
    prisma.standup.findMany({
      where: { weekStart: dayKeyToDate(week) },
      select: { memberId: true, text: true, learned: true, updatedAt: true },
    }),
  ]);

  return buildWeekStandups(
    week,
    members,
    standups.map((s) => ({ ...s, updatedAt: s.updatedAt.toISOString() })),
  );
}

/** Estado de los proyectos no archivados y carga de tareas por persona. */
export async function getProjectsReport(): Promise<ProjectsReport> {
  await requireCoordinacion();

  const live = { project: { archived: false } } as const;
  const [projects, tasks, unassigned, features, openIssues, teams, assigned, members] = await Promise.all([
    prisma.project.findMany({ where: { archived: false }, select: { id: true, name: true, status: true } }),
    prisma.task.groupBy({ by: ["projectId", "column"], where: live, _count: { _all: true } }),
    prisma.task.groupBy({
      by: ["projectId"],
      where: { ...live, assigneeId: null, column: { not: "LISTO" } },
      _count: { _all: true },
    }),
    prisma.feature.groupBy({ by: ["projectId", "status"], where: live, _count: { _all: true } }),
    prisma.issue.groupBy({ by: ["projectId"], where: { ...live, status: "ABIERTO" }, _count: { _all: true } }),
    prisma.projectMember.groupBy({ by: ["projectId"], where: live, _count: { _all: true } }),
    prisma.task.groupBy({
      by: ["assigneeId", "column"],
      where: { ...live, assigneeId: { not: null }, column: { not: "LISTO" } },
      _count: { _all: true },
    }),
    approvedMembers(),
  ]);

  return buildProjectsReport({
    projects,
    tasks: tasks.map((t) => ({ projectId: t.projectId, column: t.column, count: t._count._all })),
    unassigned: unassigned.map((t) => ({ projectId: t.projectId, count: t._count._all })),
    features: features.map((f) => ({ projectId: f.projectId, status: f.status, count: f._count._all })),
    openIssues: openIssues.map((i) => ({ projectId: i.projectId, count: i._count._all })),
    teams: teams.map((t) => ({ projectId: t.projectId, count: t._count._all })),
    assigned: assigned.flatMap((a) => (a.assigneeId ? [{ assigneeId: a.assigneeId, column: a.column, count: a._count._all }] : [])),
    members,
  });
}

/** Miembros por rol y estado, solicitudes pendientes y disponibilidad agregada. */
export async function getTeamReport(): Promise<TeamReport> {
  await requireCoordinacion();

  const [members, pending] = await Promise.all([
    prisma.member.findMany({
      where: approved,
      select: { id: true, name: true, image: true, role: true, status: true, availability: true },
    }),
    prisma.member.count({ where: { isVerifiedByCoordinator: false } }),
  ]);

  return buildTeamReport(
    members.map((m) => ({ ...m, initials: getInitials(m.name) })),
    pending,
  );
}

/** `project` de la query string: un id, o null para todos los proyectos. */
export function parseProjectParam(value: string | null): string | null {
  const id = value?.trim();
  return id ? id : null;
}

/**
 * Métricas del kanban (src/lib/kanban-metrics.ts) en las `weeks` semanas que terminan en
 * la actual, de los proyectos sin archivar o de uno solo. null si `projectId` no es un
 * proyecto sin archivar.
 *
 * Trae las tareas abiertas y las que llegaron a Listo dentro del rango, cada una con su
 * historial completo (hace falta desde la creación para el lead time). Las horas se piden
 * dos veces: por tarea sin límite de fechas (horas por tarea terminada) y por proyecto
 * dentro del rango.
 */
export async function getKanbanReport(weeks: RangeWeeks, projectId: string | null, now: Date = new Date()): Promise<KanbanReport | null> {
  await requireCoordinacion();

  const currentWeek = currentWeekStart(now);
  const range = rangeWeeks(currentWeek, weeks);
  // Lunes 00:00 en Chile: las transiciones son instantes, no fechas.
  const rangeStart = zonedTimeToInstant(range[0], "00:00");

  const scope = { project: { archived: false }, ...(projectId ? { projectId } : {}) };
  const taskWhere = {
    ...scope,
    OR: [{ column: { not: "LISTO" as const } }, { transitions: { some: { toColumn: "LISTO" as const, at: { gte: rangeStart } } } }],
  };
  const effortKinds = { in: ["TRABAJO", "REVISION"] as EffortKind[] };

  const [projects, tasks, effort, rangeHours] = await Promise.all([
    prisma.project.findMany({ where: { archived: false }, select: { id: true, name: true } }),
    prisma.task.findMany({
      where: taskWhere,
      select: {
        id: true,
        label: true,
        name: true,
        projectId: true,
        column: true,
        difficulty: true,
        createdAt: true,
        assignee: { select: { id: true, name: true, image: true, role: true, status: true } },
        transitions: { select: { fromColumn: true, toColumn: true, assigneeId: true, byId: true, at: true }, orderBy: { at: "asc" } },
      },
    }),
    prisma.timeEntry.groupBy({
      by: ["taskId", "kind"],
      where: { kind: effortKinds, task: taskWhere },
      _sum: { minutes: true },
    }),
    prisma.timeEntry.groupBy({
      by: ["projectId", "kind"],
      where: {
        ...scope,
        kind: effortKinds,
        date: { gte: dayKeyToDate(range[0]), lt: dayKeyToDate(shiftWeek(currentWeek, 1)) },
      },
      _sum: { minutes: true },
    }),
  ]);

  if (projectId && !projects.some((p) => p.id === projectId)) return null;

  return buildKanbanReport({
    weeks: range,
    now,
    projectId,
    projects,
    tasks: tasks.map((t) => ({ ...t, assignee: t.assignee ? { ...t.assignee, initials: getInitials(t.assignee.name) } : null })),
    effort: effort.flatMap((e) =>
      e.taskId && (e.kind === "TRABAJO" || e.kind === "REVISION") ? [{ taskId: e.taskId, kind: e.kind, minutes: e._sum.minutes ?? 0 }] : [],
    ),
    rangeHours: rangeHours.flatMap((h) =>
      h.kind === "TRABAJO" || h.kind === "REVISION" ? [{ projectId: h.projectId, kind: h.kind, minutes: h._sum.minutes ?? 0 }] : [],
    ),
  });
}
